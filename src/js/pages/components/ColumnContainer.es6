/* @flow */
import React from 'react'
import {findDOMNode} from 'react-dom'
import {Map} from 'immutable'

import {ContextPropType} from 'src/propTypes'
import {UIColumn} from 'src/models'
import {niceScrollLeft} from 'src/utils'
import ColumnRenderer from 'src/pages/columns'
import TimelineActions from 'src/controllers/TimelineActions'
import CloseColumnUseCase from 'src/usecases/CloseColumnUseCase'


type Props = {
  columns: UIColumn[],
}

type State = {
  friendsColumnModels: Map<string, FriendsModel>,
  talkColumnModels: Map<string, TalkModel>,
  timelineColumnModels: Map<string, TimelineModel>,
}

/**
 * カラムのコンテナ
 */
export default class ColumnContainer extends React.Component {
  static contextTypes = {
    context: ContextPropType,
  }

  props: Props
  state: State
  actionDelegate: TimelineActions
  listenerRemovers: Function[] = []

  constructor(...args: any[]) {
    super(...args)

    this.actionDelegate = new TimelineActions(this.context)
    this.state = {
      friendsColumnModels: new Map(),
      talkColumnModels: new Map(),
      timelineColumnModels: new Map(),
    }
  }

  /**
   * @override
   */
  componentDidMount() {
    const {context} = this.context

    this.listenerRemovers.push(
      context.onChange(this.onChangeContext.bind(this)),
      FriendsListenerManager.onChange(this.onChangeFriends.bind(this)),
      TalkListenerManager.onChange(this.onChangeTalk.bind(this)),
      TimelineListenerManager.onChange(this.onChangeTimeline.bind(this)),
    )
  }

  /**
   * @override
   */
  componentWillUnmount() {
    this.listenerRemovers.forEach((remover) => remover())
  }

  /**
   * @override
   */
  componentDidUpdate(prevProps: Props) {
    // 新しく追加されたカラムをFocusさせる
    const columnShouldFocus = this.props.columns.find(
      (column) => prevProps.columns.find((c) => c.key === column.key) ? false : true
    )
    if(columnShouldFocus) {
      this.scrollToColumn(columnShouldFocus.key)
    }
  }

  /**
   * @override
   */
  render() {
    const {columns} = this.props

    return (
      <div className="columnContainer" ref="container">
        {columns.map((column) => ColumnFactory.render(column, ...this.propsForTimelineColumn(column)))}
      </div>
    )
  }

  // column props

  defaultPropsForColumn(column: UIColumn) {
    return {
      key: column.key,
      column,
      ...this.handlerPropsForColumn(column),
    }
  }

  handlerPropsForColumn(column: UIColumn) {
    return {
      onClickHeader: this.onClickColumnHeader.bind(this),
      onClose: this.onCloseColumn.bind(this, column),
    }
  }

  propsForTimelineColumn(column: UIColumn) {
    const {key, params: {subject}} = column
    const columnModel = this.state.timelineColumnModels.get(key) || new TimelineModel()
    const {context} = this.context
    const {tokenState} = context.getState()
    const token = tokenState.getTokenByAcct(subject)
    const tokens = tokenState.tokens
    const props = {
      ...this.defaultPropsForColumn(column),
      ...columnModel.toProps(),
      token,
      tokens,
      onLockedPaging: () => TimelineListenerManager.onLocked(column),
      onUnlockedPaging: () => TimelineListenerManager.onUnlocked(column),
      onLoadMoreStatuses: () => TimelineListenerManager.onLoadMoreStatuses(column),
      onSubscribeListener: () => TimelineListenerManager.onSubscribeListener(column),
      onUnsubscribeListener: () => TimelineListenerManager.onUnsubscribeListener(column),
      onUpdateTimelineFilter: TimelineListenerManager.onUpdateTimelineFilter.bind(
        TimelineListenerManager, column),
    }

    return props
  }

  // private

  scrollToColumn(columnKey: string) {
    const columnNode = findDOMNode(this.refs[columnKey])
    if(!columnNode) {
      // まだ追加前では  componentDidUpdateのほうでフォローする
      return
    }
    const containerNode = findDOMNode(this.refs['container'])

    if(columnNode instanceof HTMLElement && containerNode instanceof HTMLElement) {
      // アニメーションさせる カッコイイ!!
      niceScrollLeft(
        containerNode,
        columnNode.offsetLeft - (containerNode.clientWidth - columnNode.clientWidth) / 2
      )
    }
  }

  // cb

  onChangeContext() {
    const {context} = this.context
    const {tokenState} = context.getState()
    const {columns} = this.props

    columns
      .filter(({type}) => type === COLUMN_FRIENDS)
      .forEach((column) => {
        const token = tokenState.getTokenByAcct(column.params.subject)
        token && FriendsListenerManager.updateTokenIfNeed(token, column)
      })

    columns
      .filter(({type}) => type === COLUMN_TALK)
      .forEach((column) => {
        const token = tokenState.getTokenByAcct(column.params.from)
        token && TalkListenerManager.updateTokenIfNeed(token, column)
      })

    TimelineListenerManager.updateTokens(tokenState.tokens)
  }

  onClickColumnHeader(column: UIColumn, columnNode: HTMLElement, columnScrollNode: ?HTMLElement) {
    const columnBounds = columnNode.getBoundingClientRect()

    if(columnBounds.right > window.innerWidth || columnBounds.left < 0) {
      // if the column is out of the window, adjusts horizontal scroll
      this.scrollToColumn(column.key)
    } else if(columnScrollNode != null) {
      // if the column is in the window, reset its scroll offset
      columnScrollNode.scrollTop = 0
    }
  }

  onCloseColumn(column: UIColumn) {
    const {context} = this.context

    context.useCase(new CloseColumnUseCase()).execute(column)
  }

  onChangeFriends(columnKey: string, model: FriendsModel) {
    this.setState({
      friendsColumnModels: this.state.friendsColumnModels.set(columnKey, model),
    })
  }

  onChangeTalk(columnKey: string, model: TalkModel) {
    this.setState({
      talkColumnModels: this.state.talkColumnModels.set(columnKey, model),
    })
  }

  onChangeTimeline(columnKey: string, model: TimelineModel) {
    this.setState({
      timelineColumnModels: this.state.timelineColumnModels.set(columnKey, model),
    })
  }
}
