import React from 'react'

import Dialog from './Dialog'
import {IconFont} from 'src/pages/parts'


/**
 * メディア表示ダイアログ
 */
export default class MediaViewerDialog extends Dialog {
  constructor(...args) {
    super(...args)

    const {media} = this.props
    this.state = {
      media,
    }
  }

  /**
   * @override
   */
  render() {
    const {media} = this.state

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
      <button className="dialog-button dialog-button-prev" onClick={::this.onClickPrev}>
        {'<'}
      </button>
    )
  }

  renderNextButton() {
    // TODO: replace with icon
    return (
      <button className="dialog-button dialog-button-next" onClick={::this.onClickNext}>
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
    const {mediaList} = this.props
    const media = mediaList[this.currentIdx - 1]

    this.setState({media})
  }

  onClickNext() {
    const {mediaList} = this.props
    const media = mediaList[this.currentIdx + 1]

    this.setState({media})
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
  get currentIdx() {
    const {mediaList} = this.props
    const {media} = this.state

    return mediaList.findIndex((m) => {
      return m.id === media.id
    })
  }

  get hasPrev() {
    return this.currentIdx !== 0
  }

  get hasNext() {
    const {mediaList} = this.props

    return this.currentIdx !== mediaList.length - 1
  }
}
