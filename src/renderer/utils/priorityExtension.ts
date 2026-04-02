import { Extension } from '@tiptap/core'

export interface PriorityOptions {
  types: string[]
}

export const Priority = Extension.create<PriorityOptions>({
  name: 'priority',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'taskItem', 'listItem', 'taskLink'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          priority: {
            default: null,
            keepOnSplit: false,
            parseHTML: element => element.getAttribute('data-priority'),
            renderHTML: attributes => {
              if (!attributes.priority) {
                return {}
              }
              return {
                'data-priority': attributes.priority,
              }
            },
          },
        },
      },
    ]
  },
})
