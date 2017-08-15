/* @flow */
import React from 'react'
import {UIColumn} from 'src/models'

type Column =
  | FriendsColumn
  | HashTagColumn
  | NotificationsColumn
  | TalkColumn
  | TimelineColumn

type FactoryFunction = (...props) => React.Element<Column>


class ColumnRenderer {
  _factories: Map<string, FactoryFunction> = new Map()

  register(type: string, kls: FactoryFunction) {
    this._factories.set(type, f)
  }

  render(column: UIColumn, ...props): ?React.Element<Column> {
    const kls = this._factories.get(column.type)
    assert(kls != null)

    return kls(...props)
  }
}

export default new ColumnRenderer()

// import sub columns
// TODO: Webpackのお便利機能を使う
import FriendsColumn from 'src/pages/columns/FriendsColumn'
import HashTagColumn from 'src/pages/columns/HashTagColumn'
import NotificationsColumn from 'src/pages/columns/NotificationsColumn'
import TalkColumn from 'src/pages/columns/TalkColumn'
import TimelineColumn from 'src/pages/columns/TimelineColumn'

