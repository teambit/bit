import React from 'react'
import {render} from 'ink'

export type ExitCB = (code:number) => void
let globalExit: ExitCB|undefined

export const ExitContext = React.createContext({
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  exit: (code:number) => globalExit!(code)
})

export function RenderWithExitContext({Main}:{Main:JSX.Element}){
  const {exit, promisedExit} = getPromisedExit()
  const {unmount, waitUntilExit} = render(
    <ExitContext.Provider value={{exit}}>
      {Main}
    </ExitContext.Provider>
  );
  return waitUntilExit()
    .then(() => promisedExit)
    .then(() => {
      unmount()
    })
}


function getPromisedExit() {
	const promisedExit = new Promise<number>(function(resolve){
		globalExit = (code:number) => resolve(code)
  })
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		exit:globalExit!,
		promisedExit
	}
}

