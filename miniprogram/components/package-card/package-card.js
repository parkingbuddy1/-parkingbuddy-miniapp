// 套餐卡片组件 v6
Component({
  properties: {
    package: { type: Object, value: {} },
    index: { type: Number, value: 0 },
    selected: { type: Boolean, value: false },
  },

  methods: {
    onSelect() {
      this.triggerEvent('select', { index: this.data.index });
    },
  },
});
