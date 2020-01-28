import React from 'react'
import { Color } from "ink";
import { PaperError } from "./paper-error";

export class AlreadyExistsError extends PaperError {
  constructor(type:string, name:string){
    super(`${type} ${name} already exists.`)
  }
  render(){
    return <Color red>{this.message}</Color>
  }
}
