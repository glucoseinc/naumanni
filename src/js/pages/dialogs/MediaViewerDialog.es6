import React from 'react'

import Dialog from './Dialog'
import {IconFont} from 'src/pages/parts'


/**
 * メディア表示ダイアログ
 */
export default class MediaViewerDialog extends Dialog {
  constructor(...args) {
    super(...args)

    const {initialIdx} = this.props

    this.state = {
      currentIdx: initialIdx,
    }
  }

  /**
   * @override
   */
  render() {
    const {mediaList} = this.props
    const {currentIdx} = this.state
    const media = mediaList[currentIdx]

    return (
      <div className={`${this.dialogClassName} dialog--mediaViewer--${media.type}`}>
        {this.renderCloseButton()}
        {this.hasPrev && this.renderPrevButton()}
        {this.hasNext && this.renderNextButton()}
        {media.type === 'image'
          ? this.renderImage(media)
          : this.renderVideo(media)
        }
      </div>
    )
  }

  renderPrevButton() {
    // TODO: replace with icon
    return (
      <button className="dialog-button dialog-button--prev" onClick={::this.onClickPrev}>
        {'<'}
      </button>
    )
  }

  renderNextButton() {
    // TODO: replace with icon
    return (
      <button className="dialog-button dialog-button--next" onClick={::this.onClickNext}>
        {'>'}
      </button>
    )
  }

  renderImage(media) {
    return (
      <img src={media.url} />
    )
  }

  renderVideo(media) {
    const props = {autoPlay: true}

    if(media.type === 'video') {
      props.controls = true
    } else if(media.type === 'gifv') {
      props.loop = true
    }

    return (
      <video src={media.url} {...props} />
    )
  }

  onClickPrev() {
    const {currentIdx} = this.state

    this.setState({
      currentIdx: currentIdx - 1,
    })
  }

  onClickNext() {
    const {currentIdx} = this.state

    this.setState({
      currentIdx: currentIdx + 1,
    })
  }

  /**
   * @override
   * @private
   * @return {string}
   */
  get dialogClassName() {
    return super.dialogClassName + ' dialog--mediaViewer'
  }

  // private
  get hasPrev() {
    const {currentIdx} = this.state

    return currentIdx !== 0
  }

  get hasNext() {
    const {mediaList} = this.props
    const {currentIdx} = this.state

    return currentIdx !== mediaList.length - 1
  }
}
