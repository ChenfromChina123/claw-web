declare module 'splitpanes' {
  import { DefineComponent } from 'vue'
  
  export const Splitpanes: DefineComponent<{
    horizontal?: boolean
    vertical?: boolean
    pushOtherPanes?: boolean
    dblClickSplitter?: boolean
    rtl?: boolean
    firstSplitter?: boolean
    class?: string
  }>
  
  export const Pane: DefineComponent<{
    size?: number | string
    minSize?: number | string
    maxSize?: number | string
  }>
}
