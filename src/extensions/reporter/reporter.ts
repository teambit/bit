import path from 'path';
import execa from 'execa';
import librarian from 'librarian';
import { Capsule } from '../isolator/capsule';
import { pipeOutput } from '../../utils/child_process';

export default class Reporter {
  log(...messages) {
    // console.log(...messages)
  }
}
