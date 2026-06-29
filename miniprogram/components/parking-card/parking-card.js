// 停车场卡片组件
Component({
  properties: {
    parking: {
      type: Object,
      value: {},
    },
  },

  methods: {
    onTap() {
      this.triggerEvent('click', { id: this.data.parking._id });
    },
  },
});
