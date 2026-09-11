# World Clipboard Demo

一个为吉客松准备的手机小程序交互原型：从“现实画面”抓取对象，放入世界粘贴板，再粘贴到数字工具中生成可执行结果。

当前代码是可在手机和桌面浏览器运行的 H5 Demo，尚不是可提交审核的微信原生小程序包。它刻意使用内置模拟镜头，因此不用申请摄像头权限，也不依赖远程 AI 模型，适合在现场稳定演示完整闭环。

## Demo 流程

1. 在捕捉页选择 **物体 / 颜色 / 轮廓**。
2. 点击小猫摆件，模拟一次 Pinch 抓取。
3. 结果转换为统一的透明 RGBA Clipboard Item，并自动进入创作页。
4. 点击 **拼豆模板**。
5. 页面生成 20 × 20 拼豆图纸，以及按色号统计的材料清单。
6. 点击左上角返回，可切换捕捉类型后重新体验。

## 本地运行

需要 Node.js 20+ 与 pnpm。

```bash
pnpm install
pnpm dev
```

打开 <http://127.0.0.1:5173>。

## 质量检查

```bash
pnpm test
pnpm build
```

## 当前边界与下一步

这个 Demo 验证的是产品交互和数据流，不冒充已经完成的计算机视觉版本。仓库中已实现带滞回和稳定帧判定的 pinch 状态机，下一阶段会把它接到 MediaPipe Hand Landmarker；之后再接入点提示分割，把模拟对象替换为摄像头中的真实物体。

建议的实现顺序：微信小程序工程壳与 Camera 组件 → 手部关键点 → pinch 驱动抓取 → 点提示分割服务 → 多端同步。现场演示仍保留模拟模式作为降级方案。

## 开源参考

架构与交互借鉴了 AR Cut & Paste、pARallax、KineMouse、Google MediaPipe Web samples 和 Perler Beads Generator。当前实现为独立代码，详细归属见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
