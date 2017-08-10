import React from 'react'
import {findDOMNode} from 'react-dom'
import {intlShape} from 'react-intl'
import classNames from 'classnames'
import Toggle from 'react-toggle'
import {FormattedMessage as _FM} from 'react-intl'
import {
  COLUMN_TIMELINE,
  SUBJECT_MIXED,
  TIMELINE_FILTER_BOOST, TIMELINE_FILTER_REPLY,
} from 'src/constants'
import {ContextPropType} from 'src/propTypes'
import {ColumnHeader, ColumnHeaderMenu, NowLoading} from 'src/pages/parts'
import PagingColumnContent from 'src/pages/components/PagingColumnContent'


const TIMELINE_FILTER_TEXT_MAP = {
  [TIMELINE_FILTER_BOOST]: 'column.menu.show_boosts',
  [TIMELINE_FILTER_REPLY]: 'column.menu.show_reply',
}

const storageKeyForFilter = (type, subject, timelineType) => (
  `naumanni::${type}:${subject}-${timelineType}`
)


/**
 * タイムラインのカラム
 */
export default class TimelineColumn extends React.Component {
  static contextTypes = {
    context: ContextPropType,
    intl: intlShape,
  }

  constructor(...args) {
    super(...args)

    const {column: {params: {subject, timelineType}}} = this.props

    this.state = {
      ...this.state,
      isMenuVisible: false,
      filters: new Map([
        [TIMELINE_FILTER_BOOST, localStorage.getItem(storageKeyForFilter(TIMELINE_FILTER_BOOST, subject, timelineType))
          ? JSON.parse(localStorage.getItem(storageKeyForFilter(TIMELINE_FILTER_BOOST, subject, timelineType)))
          : true],
        [TIMELINE_FILTER_REPLY, localStorage.getItem(storageKeyForFilter(TIMELINE_FILTER_REPLY, subject, timelineType))
          ? JSON.parse(localStorage.getItem(storageKeyForFilter(TIMELINE_FILTER_REPLY, subject, timelineType)))
          : true],
      ]),
    }
  }

  get isMixedTimeline() {
    const {column: {params: {subject}}} = this.props

    return subject === SUBJECT_MIXED
  }

  /**
   * @override
   */
  componentDidMount() {
    this.props.onSubscribeListener()
    this.props.onUpdateTimelineFilter(this.state.filters)
  }

  /**
   * @override
   */
  componentWillUnmount() {
    this.props.onUnsubscribeListener()
  }

  /**
   * @override
   */
  render() {
    const {isLoading} = this.props

    return (
      <div className="column">
        <ColumnHeader
          canShowMenuContent={!isLoading}
          isPrivate={true}
          menuContent={this.renderMenuContent()}
          title={this.renderTitle()}
          onClickHeader={this.onClickHeader.bind(this)}
          onClickMenu={this.onClickMenuButton.bind(this)}
        />

        {isLoading
          ? <div className="column-body is-loading"><NowLoading /></div>
          : this.renderBody()
        }
      </div>
    )
  }


  // render


  renderTitle() {
    const {column: {params: {timelineType}}} = this.props
    const {formatMessage} = this.context.intl

    if(this.isMixedTimeline) {
      return formatMessage({id: `column.title.united_timeline_${timelineType}`})
    } else {
      const {token} = this.props
      const typeName = formatMessage({id: `column.title.timeline_${timelineType}`})

      if(!token)
        return typeName

      return (
        <h1 className="column-headerTitle">
          <div className="column-headerTitleSub">{token.acct}</div>
          <div className="column-headerTitleMain">{typeName}</div>
        </h1>
      )
    }
  }

  renderMenuContent() {
    return (
      <ColumnHeaderMenu isCollapsed={!this.state.isMenuVisible} onClickClose={this.props.onClose}>
        {this.renderFilterMenus()}
      </ColumnHeaderMenu>
    )
  }

  renderFilterMenus() {
    return [...this.state.filters.entries()].map(([type, toggle]) => (
      <div className="menu-item menu-item--toggle" key={`${type}:${toggle}`}>
        <Toggle
          checked={toggle}
          onChange={this.onChangeTimelineFilter.bind(this, type)} />
        <label htmlFor={`${type}-visibility`}><_FM id={TIMELINE_FILTER_TEXT_MAP[type]} /></label>
      </div>
    ))
  }

  renderBody() {
    const {
      column: {params: {subject}},
      isLoading, isTailLoading, timeline, tokens,
      onLockedPaging, onUnlockedPaging,
    } = this.props

    return (
      <div className={classNames(
        'column-body',
        {'is-loading': isLoading}
      )}>
        <PagingColumnContent
          isTailLoading={isTailLoading}
          subject={subject}
          timeline={timeline}
          tokens={tokens}
          onLoadMoreStatuses={this.onLoadMoreStatuses.bind(this)}
          onLockedPaging={onLockedPaging}
          onUnlockedPaging={onUnlockedPaging}
          onScrollNodeLoaded={this.onScrollNodeLoaded.bind(this)}
        />
      </div>
    )
  }


  // cb


  onChangeTimelineFilter(type) {
    const {column: {params: {subject, timelineType}}, onUpdateTimelineFilter} = this.props
    const {filters} = this.state
    const newValue = !filters.get(type)

    filters.set(type, newValue)
    this.setState({filters})

    onUpdateTimelineFilter(filters)

    localStorage.setItem(
      storageKeyForFilter(type, subject, timelineType),
      newValue)
  }

  onScrollNodeLoaded(el) {
    this.scrollNode = el
  }

  onLoadMoreStatuses() {
    this.props.onLoadMoreStatuses()
  }

  onClickHeader() {
    const {column, onClickHeader} = this.props
    const node = findDOMNode(this)

    if(node instanceof HTMLElement) {
      if(this.scrollNode != null) {
        onClickHeader(column, node, this.scrollNode)
      } else {
        onClickHeader(column, node, undefined)
      }
    }
  }

  onClickMenuButton(e) {
    e.stopPropagation()
    this.setState({isMenuVisible: !this.state.isMenuVisible})
  }
}
require('./').registerColumn(COLUMN_TIMELINE, TimelineColumn)
