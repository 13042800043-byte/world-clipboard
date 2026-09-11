Component({
  properties: {
    template: { type: Object, value: {} },
  },

  methods: {
    onTap() {
      if (this.data.template.disabled) return
      this.triggerEvent('select', { id: this.data.template.id })
    },
  },
})
