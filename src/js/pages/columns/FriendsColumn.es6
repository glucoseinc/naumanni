/* @flow */
import React from 'react'
import {findDOMNode} from 'react-dom'
import {FormattedMessage as _FM} from 'react-intl'
import {intlShape} from 'react-intl'

import {AppPropType, ContextPropType} from 'src/propTypes'
import {SUBJECT_MIXED, COLUMN_FRIENDS, COLUMN_TALK} from 'src/constants'
import {Account, OAuthToken, UIColumn} from 'src/models'
import AddColumnUseCase from 'src/usecases/AddColumnUseCase'
import TimelineActions from 'src/controllers/TimelineActions'
import AccountRow from '../components/AccountRow'
import {fuzzy_match as fuzzyMatch} from 'src/libs/fts_fuzzy_match'
import {ColumnHeader, ColumnHeaderMenu, NowLoading} from '../parts'
import FriendsListener, {UIFriend} from 'src/controllers/FriendsListener'

// temporary
import TokenState from 'src/store/TokenState'

type Props = {
  column: UIColumn,
  subject: string,
  onClickHeader: (UIColumn, HTMLElement, ?HTMLElement) => void,
  onClose: (UIColumn) => void,
}

type State = {
  filter: string,
  isMenuVisible: boolean,

  // temporary
  token: OAuthToken,
  tokenState: TokenState,
  friends: UIFriend[],
  sortedFriends: UIFriend[],
  loading: boolean,
}


/**
 * タイムラインのカラム
 */
export default class FriendsColumn extends React.Component {
  static contextTypes = {
    app: AppPropType,
    context: ContextPropType,
    intl: intlShape,
  }
  props: Props
  state: State

  lastTalkRecordUpdated: ?string
  listener: FriendsListener
  listenerRemovers: Function[]
  actionDelegate: TimelineActions

  constructor(...args: any[]) {
    super(...args)
    // mixed timeline not allowed
    require('assert')(args[0].subject !== SUBJECT_MIXED)
    const {subject} = this.props

    this.listener = new FriendsListener(subject)
    this.listenerRemovers = []
    this.actionDelegate = new TimelineActions(this.context)
    this.lastTalkRecordUpdated = undefined
    this.state = {
      ...this.getStateFromContext(),
      filter: '',
      friends: [],
      isMenuVisible: false,
      loading: true,
      sortedFriends: undefined,
    }
  }

  /**
   * @override
   */
  componentDidMount() {
    const {context} = this.context

    this.listenerRemovers.push(
      context.onChange(this.onChangeContext.bind(this)),
      this.listener.onChange(this.onChangeFriends.bind(this)),
    )

    // make event listener
    const token = this.state.tokenState.getTokenByAcct(this.props.subject)
    this.listener.open(token)
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
  render() {
    // const {isLoading} = this.props  // TODO: give isLoading as props from FriendsListener
    const {loading} = this.state

    return (
      <div className="column">
        <ColumnHeader
          canShowMenuContent={!loading}
          isPrivate={true}
          menuContent={this.renderMenuContent()}
          title={this.renderTitle()}
          onClickHeader={this.onClickHeader.bind(this)}
          onClickMenu={this.onClickMenuButton.bind(this)}
        />

        {loading
          ? <div className="column-body is-loading"><NowLoading /></div>
          : this.renderBody()
        }
      </div>
    )
  }

  renderTitle() {
    const {token} = this.state

    if(!token) {
      return <_FM id="column.title.message" />
    }

    return (
      <h1 className="column-headerTitle">
        <div className="column-headerTitleSub">{token.acct}</div>
        <div className="column-headerTitleMain"><_FM id="column.title.message" /></div>
      </h1>
    )
  }

  renderMenuContent() {
    const {column, onClose} = this.props

    return <ColumnHeaderMenu
      isCollapsed={!this.state.isMenuVisible}
      onClickClose={onClose.bind(this, column)} />
  }

  renderBody() {
    if(this.state.loading) {
      return <NowLoading />
    }

    const friends = this.state.sortedFriends || this.state.friends

    return (
      <div className="column-body column-body--friends">
        {this.renderFilter()}
        <ul className="friends-list" ref="friendsList">
          {friends.map((friend) => (
            <li key={friend.key}>
              <AccountRow
                account={friend.account}
                onClick={this.onClickFriend.bind(this)}
                {...this.actionDelegate.props}
              />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  /**
   * @override
   */
  getStateFromContext() {
    const {context} = this.context
    const state = context.getState()

    state.token = state.tokenState.getTokenByAcct(this.props.subject)
    if(this.lastTalkRecordUpdated !== state.talkState[this.props.subject]) {
      this.lastTalkRecordUpdated = state.talkState[this.props.subject]
      this.listener.sortFriends()
    }
    return state
  }

  renderFilter() {
    const {filter} = this.state
    const {formatMessage: _} = this.context.intl

    return (
      <div className="friends-filter">
        <input type="text" value={filter} onChange={this.onChangeFilter.bind(this)}
          placeholder={_({id: 'message.freind_filter.placeholder'})} />
      </div>
    )
  }

  // cb
  onChangeContext() {
    this.setState(this.getStateFromContext())
    this.listener.updateTokens(this.state.token)
  }

  onChangeFriends() {
    this.setState({
      friends: this.listener.state.friends,
      loading: false,
    })
  }

  onClickHeader() {
    const {column, onClickHeader} = this.props
    const node = findDOMNode(this)
    const scrollNode = findDOMNode(this.refs.friendsList)

    if(node instanceof HTMLElement) {
      if(scrollNode && scrollNode instanceof HTMLElement) {
        onClickHeader(column, node, scrollNode)
      } else {
        onClickHeader(column, node, undefined)
      }
    }
  }

  onClickMenuButton(e: SyntheticEvent) {
    e.stopPropagation()
    this.setState({isMenuVisible: !this.state.isMenuVisible})
  }

  onClickFriend(account: Account) {
    const {context} = this.context

    context.useCase(new AddColumnUseCase()).execute(COLUMN_TALK, {
      to: account.acct,
      from: this.props.subject,
    })
  }

  /**
   * 絞り込む。とりあえずusernameをレーベンシュタイン距離でソートしてみる
   * @param {Event} e
   */
  onChangeFilter(e: SyntheticInputEvent) {
    const filter = e.target.value
    let sortedFriends

    if(filter.length) {
      sortedFriends =
        this.state.friends
          .map((friend) => {
            const {account} = friend
            const [matchedAcct, scoreAcct, formattedAcct] = fuzzyMatch(filter, account.acct)
            const [matchedDisplayName, scoreDisplayName, formattedDisplayName] =
              fuzzyMatch(filter, account.display_name || '')

            return {
              friend,
              matched: matchedAcct || matchedDisplayName,
              score: Math.max(scoreAcct, scoreDisplayName),
              formated: {
                acct: formattedAcct,
                displayName: formattedDisplayName,
              },
            }
          })
          .filter(({matched}) => matched)

      sortedFriends.sort(({score: scoreA}, {score: scoreB}) => {
        if(scoreA < scoreB)
          return 1
        else if(scoreA > scoreB)
          return -1
        return 0
      })
      sortedFriends = sortedFriends.map(({friend}) => friend)
    }

    this.setState({filter, sortedFriends})
  }
}
require('./').registerColumn(COLUMN_FRIENDS, FriendsColumn)
