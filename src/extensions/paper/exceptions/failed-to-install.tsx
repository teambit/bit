import React from 'react'
import { Color } from "ink";
import { PaperError } from "./paper-error";

export class FailedToInstall extends PaperError {
  constructor(errorMessage: string){
    super(`Failed to install: ${errorMessage}`)
    // super(`${type} ${name} already exists.`)
  }
  render(){
    return <Color red>Failed to install: {this.message}</Color>
  }
}
