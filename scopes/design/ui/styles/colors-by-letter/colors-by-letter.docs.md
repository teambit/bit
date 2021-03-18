---
labels: ['react', 'css', 'colors']
description: 'Colors and letter css component'
---

import { colorsByLetter } from './index';

A CSS component that make a color for the received letter, can be used for a background-color or a text color.

Text colors:
```js live
() => {
  const letters = [
  'a' , 'b' , 'c' , 'd' , 'e' , 'f' , 'g' , 'h' , 'i' ,
  'j' , 'k' , 'l' , 'm' , 'n' , 'o' , 'p' , 'q' , 'r' , 's' ,
  't' , 'u' , 'v' , 'w' , 'x' , 'y' , 'z' ];
  return (
    <div>
      {letters.map((value) => <div className={colorsByLetter[value]}>{value}</div>)}
    </div>
  )
}
```

Background colors:
```js live
() => {
  const letters = [
  'a' , 'b' , 'c' , 'd' , 'e' , 'f' , 'g' , 'h' , 'i' ,
  'j' , 'k' , 'l' , 'm' , 'n' , 'o' , 'p' , 'q' , 'r' , 's' ,
  't' , 'u' , 'v' , 'w' , 'x' , 'y' , 'z' ];
  return (
    <div>
      {letters.map((value) => <div className={colorsByLetter[`bg-${value}`]}>{value}</div>)}
    </div>
  )
}
```
