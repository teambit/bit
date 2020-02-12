import React from 'react'
import { Color } from "ink";
import { PaperError } from "../paper/exceptions";

export class FailedToInstall extends PaperError {
  constructor(errorMessage: string){
    super(`Failed to install: ${errorMessage}`)
  }
  render(){
    return <Color red>{this.message}</Color>
  }
}
