# Third-party references

World Clipboard Demo 的源代码为独立实现。以下项目用于产品研究、API 选型或算法结构参考；没有直接复制其源文件。

| Project | License | How it informed this demo |
| --- | --- | --- |
| [AR Cut & Paste](https://github.com/cyrildiagne/ar-cutpaste) | MIT | “拍摄现实对象并粘贴到数字端”的核心交互先例 |
| [pARallax](https://github.com/Kabra01a/pARallax) | MIT | 本地分割管线、目标适配器和降级思路 |
| [KineMouse](https://github.com/4shil/kinemouse) | MIT | pinch 手势的滞回与有限状态机思路 |
| [MediaPipe Samples for Web](https://github.com/google-ai-edge/mediapipe-samples-web) | Apache-2.0 | 后续 Hand Landmarker 与 Interactive Segmenter 的官方 Web API 参考 |
| [Perler Beads Generator](https://github.com/Jett-Wu/Perler_Beads_Generator) | MIT | 图像采样、最近色匹配和材料统计的处理阶段划分 |

另考察了 [perler-beads](https://github.com/Zippland/perler-beads)（AGPL-3.0）和 [perler-studio](https://github.com/real-jiakai/perler-studio)；它们仅用于产品对比，没有使用其中代码。
