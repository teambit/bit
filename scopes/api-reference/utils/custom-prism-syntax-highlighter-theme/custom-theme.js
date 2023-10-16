export default {
  'code[class*="language-"]': {
    fontFamily: '"Fira Code", "Fira Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize: '14px',
    lineHeight: '1.5',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    MozTabSize: '2',
    OTabSize: '2',
    tabSize: '2',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
    background: '#F1F2F4',
    color: '#6c5ce7',
  },
  'pre[class*="language-"]': {
    fontFamily: '"Fira Code", "Fira Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize: '14px',
    lineHeight: '1.5',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    MozTabSize: '2',
    OTabSize: '2',
    tabSize: '2',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
    background: '#F1F2F4',
    color: '#6c5ce7',
    padding: '1em',
    margin: '.5em 0',
    borderRadius: '.3em',
    overflow: 'auto',
  },
  'pre > code[class*="language-"]': {
    fontSize: '1em',
  },
  'code[class*="language-"] ::-moz-selection': {
    textShadow: 'none',
    background: 'hsl(230, 1%, 90%)',
  },
  'pre[class*="language-"]::selection': {
    textShadow: 'none',
    background: 'hsl(230, 1%, 90%)',
  },
  ':not(pre) > code[class*="language-"]': {
    padding: '0.2em 0.3em',
    borderRadius: '.3em',
  },
  comment: {
    color: 'hsl(230, 4%, 64%)',
  },
  prolog: {
    color: 'hsl(230, 4%, 64%)',
  },
  doctype: {
    color: 'hsl(230, 8%, 24%)',
  },
  cdata: {
    color: 'hsl(230, 4%, 64%)',
  },
  punctuation: {
    color: 'hsl(230, 8%, 24%)',
  },
  namespace: {
    Opacity: '.7',
  },
  tag: {
    color: 'hsl(5, 74%, 59%)',
  },
  operator: {
    color: 'hsl(221, 87%, 60%)',
  },
  number: {
    color: '#b800b8',
  },
  property: {
    color: '#111b27',
  },
  function: {
    color: '#b800b8',
  },
  'tag-id': {
    color: '#2d2006',
  },
  selector: {
    color: '#2d2006',
  },
  'atrule-id': {
    color: '#2d2006',
  },
  'code.language-javascript': {
    color: '#896724',
  },
  'attr-name': {
    color: '#896724',
  },
  'code.language-css': {
    color: 'hsl(230, 8%, 24%)',
  },
  'code.language-scss': {
    color: 'hsl(230, 8%, 24%)',
  },
  boolean: {
    color: '#b800b8',
  },
  string: {
    color: 'hsl(119, 34%, 47%)',
  },
  entity: {
    color: 'hsl(230, 8%, 24%)',
    cursor: 'help',
  },
  url: {
    color: 'hsl(230, 8%, 24%)',
  },
  '.language-css .token.string': {
    color: 'hsl(230, 8%, 24%)',
  },
  '.language-scss .token.string': {
    color: 'hsl(230, 8%, 24%)',
  },
  '.style .token.string': {
    color: 'hsl(230, 8%, 24%)',
  },
  'attr-value': {
    color: 'hsl(230, 8%, 24%)',
  },
  builtin: {
    color: 'hsla(301, 63%, 40%, 1)',
  },
  keyword: {
    color: 'hsla(301, 63%, 40%, 1)',
  },
  control: {
    color: 'hsl(230, 8%, 24%)',
  },
  directive: {
    color: 'hsl(230, 8%, 24%)',
  },
  unit: {
    color: 'hsl(230, 8%, 24%)',
  },
  statement: {
    color: 'hsl(230, 8%, 24%)',
  },
  regex: {
    color: 'hsl(230, 8%, 24%)',
  },
  atrule: {
    color: '#b800b8',
  },
  placeholder: {
    color: '#93abdc',
  },
  variable: {
    color: 'hsl(221, 87%, 60%);',
  },
  deleted: {
    textDecoration: 'line-through',
  },
  inserted: {
    borderBottom: '1px dotted #2d2006',
    textDecoration: 'none',
  },
  italic: {
    fontStyle: 'italic',
  },
  important: {
    fontWeight: 'bold',
    color: '#896724',
  },
  bold: {
    fontWeight: 'bold',
  },
  'pre > code.highlight': {
    Outline: '.4em solid #896724',
    OutlineOffset: '.4em',
  },
  '.line-numbers .line-numbers-rows': {
    borderRightColor: '#ece8de',
  },
  '.line-numbers-rows > span:before': {
    color: '#cdc4b1',
  },
  '.line-highlight': {
    background: 'linear-gradient(to right, rgba(45, 32, 6, 0.2) 70%, rgba(45, 32, 6, 0))',
  },
};
