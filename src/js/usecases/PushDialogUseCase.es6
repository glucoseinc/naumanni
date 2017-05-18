import {UseCase} from 'almin'

import * as actions from 'src/actions'

/**
 * ダイアログを追加するUseCase
 */
export default class PushDialogUseCase extends UseCase {
  constructor() {
    super()
  }

  /**
   * @override
   * @param {string} dialogType
   * @param {object} mediaList
   * @param {object} cursor
   */
  async execute(dialogType, mediaList, cursor) {
    this.dispatch({
      type: actions.DIALOG_PUSH_REQUESTED,
      dialogType,
      mediaList,
      cursor,
    })
  }
}
