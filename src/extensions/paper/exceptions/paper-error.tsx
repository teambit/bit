import React from 'react'


export abstract class PaperError extends Error {
  abstract render(): React.ReactElement
}

