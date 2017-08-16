/* @flow */
import {List} from 'immutable'

import {
  COLUMN_NOTIFICATIONS,
  MAX_STATUSES,
} from 'src/constants'
import ChangeEventEmitter from 'src/utils/EventEmitter'
import TimelineData, {NotificationRef, StatusRef} from 'src/infra/TimelineData'
import {NotificationTimeline, StatusTimeline} from 'src/models/Timeline'
import TimelineListener from 'src/controllers/TimelineListener'
import NotificationListener from 'src/controllers/NotificationListener'
import {
  HomeTimelineLoader,
  LocalTimelineLoader,
  FederationTimelineLoader,
  AccountTimelineLoader,
  NotificationTimelineLoader,
  HashtagTimelineLoader,
} from 'src/controllers/TimelineLoader'
import TokenListener from 'src/controllers/TokenListener'
import {OAuthToken, UIColumn} from 'src/models'


type Timeline =
  | NotificationTimeline
  | StatusTimeline

type Listener =
  | TimelineListener
  | NotificationListener

type Loader =
  | HomeTimelineLoader
  | LocalTimelineLoader
  | FederationTimelineLoader
  | AccountTimelineLoader
  | NotificationTimelineLoader
  | HashtagTimelineLoader

type LoaderInfo = {|loader: Loader, loading: boolean|}


export class TimelineModel {
  isLoading: boolean
  isTailLoading: boolean
  timeline: List<NotificationRef | StatusRef>

  constructor(
    isLoading: boolean = true,
    isTailLoading: boolean = false,
    timeline: List<NotificationRef | StatusRef> = new List()
  ) {
    this.isLoading = isLoading
    this.isTailLoading = isTailLoading
    this.timeline = timeline
  }

  toProps() {
    return {
      isLoading: this.isLoading,
      isTailLoading: this.isTailLoading,
      timeline: this.timeline,
    }
  }
}


class TimelineListenerManager extends ChangeEventEmitter {
  db: TimelineData = TimelineData
  listeners: Map<string, Listener> = new Map()
  listenerRemovers: Map<string, Function[]> = new Map()
  timelines: Map<string, Timeline> = new Map()
  subtimelines: Map<string, Timeline> = new Map()
  subtimelineChangeRemovers: Map<string, Function> = new Map()
  loaderInfos: Map<string, {[token_address: string]: LoaderInfo}> = new Map()
  tokenListeners: Map<string, TokenListener> = new Map()
  isLoadingStatuses: Map<string, boolean> = new Map()
  isTailLoadingStatuses: Map<string, boolean> = new Map()
  _isScrollLockedStatuses: Map<string, boolean> = new Map()
  _tokens: List<OAuthToken> = new List()


  // public


  updateTokens(tokens: List<OAuthToken>) {
    this._tokens = tokens

    for(const listener of this.tokenListeners.values()) {
      listener.updateTokens(this._tokens)
    }
  }

  onSubscribeListener(column: UIColumn) {
    const {key, type, params: {subject}} = column

    if(type === COLUMN_NOTIFICATIONS) {
      const timeline = new NotificationTimeline(MAX_STATUSES)
      const listener = new NotificationListener(timeline, this.db)

      this.listeners.set(key, listener)
      this.timelines.set(key, timeline)
      this.listenerRemovers.set(key, [
        timeline.onChange(this.onTimelineChanged.bind(this, column)),
        this.db.registerTimeline(timeline),
      ])
      this.isLoadingStatuses.set(key, true)
      this._isScrollLockedStatuses.set(key, false)
    } else {
      // TODO: for TimelineColumn
    }

    const tokenListener = new TokenListener(subject, {
      onTokenAdded: this.onTokenAdded.bind(this, column),
      onTokenRemoved: this.onTokenRemoved.bind(this, column),
      onTokenUpdated: this.onTokenUpdated.bind(this, column),
    })

    tokenListener.updateTokens(this._tokens)
    this.tokenListeners.set(key, tokenListener)
  }

  onUnsubscribeListener(column: UIColumn) {
    const {key} = column

    const listenerRemovers = this.listenerRemovers.get(key)
    listenerRemovers && listenerRemovers.forEach((remover) => remover())

    const subtimeline = this.subtimelines.get(key)
    if(subtimeline != null) {
      this.db.decrement(subtimeline.uris)
      this.subtimelines.delete(key)
    }

    const timeline = this.timelines.get(key)
    if(timeline != null) {
      this.db.decrement(timeline.uris)
      this.timelines.delete(key)
    }

    const remover = this.subtimelineChangeRemovers.get(key)
    if(remover != null) {
      remover()
      this.subtimelineChangeRemovers.delete(key)
    }

    const listener = this.listeners.get(key)
    if(listener != null) {
      listener.clean()
      this.listeners.delete(key)
    }
  }

  onTokenAdded(column: UIColumn, newToken: OAuthToken) {
    const {key} = column
    const listener = this.listeners.get(key)
    const timeline = this.timelines.get(key)

    if(listener != null && timeline != null) {
      listener.addListener(newToken.acct, newToken)

      const loader = this._makeLoader(column, timeline, newToken)

      loader && loader.loadInitial()
    }
  }

  onTokenRemoved(column: UIColumn, oldToken: OAuthToken) {
    const {key} = column
    const listener = this.listeners.get(key)

    listener && listener.removeListener(oldToken.acct)
  }

  onTokenUpdated(column: UIColumn, newToken: OAuthToken, oldToken: OAuthToken) {
    const {key} = column
    const {acct} = newToken
    const listener = this.listeners.get(key)

    if(listener != null) {
      listener.removeListener(acct)
      listener.addListener(acct, newToken)
    }
  }

  onLoadMoreStatuses(column: UIColumn) {
    const {key} = column
    const subtimeline = this.subtimelines.get(key)
    require('assert')(subtimeline)

    const tokenListener = this.tokenListeners.get(key)

    if(tokenListener != null && this.loaderInfos.get(key) === undefined) {
      let loaderInfos = {}
      for(const token of tokenListener.getTokens()) {
        loaderInfos[token.address] = {
          loader: this._makeLoader(column, subtimeline, token),
          loading: false,
        }
      }
      this.loaderInfos.set(key, loaderInfos)
    }

    const loaderInfos = this.loaderInfos.get(key)

    if(loaderInfos != null) {
      for(const infoKey of Object.keys(loaderInfos)) {
        const loaderInfo = loaderInfos[infoKey]

        if(!loaderInfo.loading && !loaderInfo.loader.isTailReached()) {
          loaderInfo.loading = true
          loaderInfo.loader.loadNext()
            .then(() => {
              loaderInfo.loading = false
              this._updateLoadingStatus(column)
            }, (...args) => {
              console.log('loadNext failed: ', args)
              loaderInfo.loading = false
              this._updateLoadingStatus(column)
            })
        }
      }
    }
    this._updateLoadingStatus(column)
  }


  // private


  /**
   * @override
   */
  emitChange(columnKey: string, model: TimelineModel) {
    this.emit(this.EVENT_CHANGE, columnKey, model)
  }

  _makeLoader(column: UIColumn, timeline: Timeline, token: OAuthToken): ?Loader {
    const {type} = column

    if(type == COLUMN_NOTIFICATIONS) {
      return new NotificationTimelineLoader(timeline, token, this.db)
    } else {
      // TODO: for TimelineColumn
    }
    return undefined
  }

  _updateLoadingStatus(column: UIColumn) {
    const {key} = column
    const loaderInfos = this.loaderInfos.get(key)
    const isTailLoading = loaderInfos != null &&
      !Object.keys(loaderInfos).every((k) => !loaderInfos[k].loading )

    this.isTailLoadingStatuses.set(key, isTailLoading)

    const isLoading = this.isLoadingStatuses.get(key)
    const timeline = this.timelines.get(key)

    if(timeline != null) {
      const model = new TimelineModel(isLoading, isTailLoading, timeline.timeline)

      this.emitChange(key, model)
    }
  }

  // cb

  onTimelineChanged(column: UIColumn) {
    const {key} = column
    const timeline = this.timelines.get(key)
    const isScrollLocked = this._isScrollLockedStatuses.get(key)

    if(timeline != null && isScrollLocked != null) {
      if(!isScrollLocked) {
        const isLoading = false
        const isTailLoading = this.isTailLoadingStatuses.get(key) || false
        const model = new TimelineModel(isLoading, isTailLoading, timeline.timeline)

        this.isLoadingStatuses.set(key, isLoading)
        this.emitChange(key, model)
      }
    }
  }

  onSubtimelineChanged(column: UIColumn) {
    const {key} = column
    const subtimeline = this.subtimelines.get(key)

    if(subtimeline != null) {
      const isLoading = false
      const isTailLoading = this.isTailLoadingStatuses.get(key) || false
      const model = new TimelineModel(isLoading, isTailLoading, subtimeline.timeline)

      this.isLoadingStatuses.set(key, isLoading)
      this.emitChange(key, model)
    }
  }

  onLocked(column: UIColumn) {
    const {key} = column
    const timeline = this.timelines.get(key)

    if(timeline != null) {
      const subtimeline = timeline.clone()

      subtimeline.max = undefined
      this.subtimelines.set(key, subtimeline)
      this.subtimelineChangeRemovers.set(key, this.onSubtimelineChanged.bind(this, column))
      this.db.registerTimeline(subtimeline)
      this.db.increment(subtimeline.uris)

      const isLoading = false
      const isTailLoading = false
      const model = new TimelineModel(isLoading, isTailLoading, subtimeline.timeline)

      this._isScrollLockedStatuses.set(key, true)
      this.emitChange(key, model)
    }
  }

  onUnlocked(column: UIColumn) {
    const {key} = column
    const subtimeline = this.subtimelines.get(key)

    if(subtimeline != null) {
      this.db.decrement(subtimeline.uris)
      this.db.unregisterTimeline(subtimeline)
      this.subtimelines.delete(key)
      this.loaderInfos.delete(key)

      const remover = this.subtimelineChangeRemovers.get(key)

      if(remover != null) {
        remover()
        this.subtimelineChangeRemovers.delete(key)
      }

      const timeline = this.timelines.get(key)

      if(timeline != null) {
        const isLoading = false
        const isTailLoading = this.isTailLoadingStatuses.get(key) || false
        const model = new TimelineModel(isLoading, isTailLoading, timeline.timeline)

        this.isLoadingStatuses.set(key, isLoading)
        this._isScrollLockedStatuses.set(key, false)
        this.emitChange(key, model)
      }
    }
  }
}

export default new TimelineListenerManager()
