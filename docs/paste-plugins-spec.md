# Paste Plugins：可用转换 Demo

## 目标与范围

将现有贴纸、像素画、LEGO、十字绣从禁用占位改为真实抠图转换。保持 Camera / Clipboard 两页、ClipboardItem、手势与抠图链路不变。LEGO 为二维平面砖块模板，不是 3D 重建；积木/绣线使用通用近似 RGB，不冒用 LEGO/DMC 官方采购色号。

## 技术与命令

原生小程序 TypeScript/WXML/WXSS；现有 FastAPI、OpenCV、NumPy、Pillow。无新运行依赖、账户、数据库或第三方服务。

验证：`pnpm test`、`pnpm typecheck:miniprogram`、`backend/.venv/Scripts/python.exe -m pytest backend/tests -q`；修改页使用微信工具 bundled wcc/wcsc 编译。启动沿用 README 的 uvicorn 命令。

## 接口与结构

新增 `POST /api/templates/{kind}`，kind 为 `sticker | pixel | lego | cross-stitch`；请求 `{image:PNG data URL,size:32|48|64,maxColors:8|16|24,border:0|8|16}`，可选参数有默认值。沿用现有图像大小安全限制及结构化错误。

请求默认 size=32 / maxColors=16 / border=8，十字绣前端默认 48 格。必须为带 alpha / PNG transparency 的 PNG；JSON image 最长 7,000,000 字符、解码文件最多 5MB、最多 20MP，空前景拒绝，错误返回既有 `{error:{code,message}}`。输出 PNG 单张客户端上限 9,000,000 字符；输出尺寸由生成器固定边界约束（贴纸原图最长边 1024，排版 1200×1697，图纸最大 1592×1592），只落盘为固定的本地 PNG，不接受外部 URL。

响应 `{kind,title,previewImage,chartImage,exportImage,previewLabel,chartLabel,exportLabel,paletteLabel,metrics:[{label,value}],materials:[{id,name,hex,count,unit}],notes:string[]}`。所有图片为 PNG data URL；客户端限定长度/形状，不接受任意远程 URL。LEGO 内部/响应附加 placements 记录每块砖 x/y/width/height/color，图纸显示相同坐标边界。

后端 `app/paste_plugins/`：各转换独立模块，共享 PNG/棋盘预览/网格工具；前端 `plugins/{sticker,pixel-art,lego,cross-stitch}` 独立描述/生成接口，共享受检验的 transport 与导出工具。既有拼豆插件和旧 API 保留。

## 验收

1. 贴纸使用原始细节，alpha 裁切、可选白边、透明导出 PNG；另有六枚排版 PNG，不承诺打印机实际尺寸或矢量刀线。
2. 像素画 32/48/64，色数上限、透明区域与比例保留，导出 nearest-neighbor 放大透明 PNG。
3. LEGO 同色格合并为常用 1×1 / 1×2 / 1×3 / 1×4 / 2×2 / 2×3 / 2×4 砖块（可旋转），无越界、重叠、跨色或填透明孔；砖块统计与坐标图一致。不是全局最少砖优化，底板另备、实际颜色/规格库存需核实。
4. 十字绣针位图、颜色针数、14CT 布面图案尺寸估算；不计算实际耗线长度、不声称官方绣线色号。
5. 所有入口可切换、调参数、显示读取/错误/重试、放大预览；有保存 PNG 到相册动作与拒绝权限提示。原图/图纸各自导出内容清楚；返回、换插件、隐藏页使旧异步结果失效，放大/保存返回保留工作区。

## 计划与测试

顺序：契约与 RED 测试 → 贴纸/像素画 → LEGO/十字绣 → 安全 API → 原生工作区/导出 → 编译/接口/PNG视觉验证 → README。

pytest 用合成匿名 BGRA 验证 alpha/RGB/排版、砖块覆盖和计数、针数及尺寸；Vitest 覆盖请求/响应校验、所有入口、参数、过期请求、保存失败/权限拒绝。代码示例：`generate_sticker(image, border=8)`；函数职责专一，不往 ClipboardItem 塞插件字段。

## 边界

始终：先测试再改、输入输出校验、保留用户已有 project.config.json 更改、记录电脑测试与真机未验收的区别。
需用户确认：新增模型、第三方付费服务、正式上线 HTTPS/权限配置、3D LEGO 或实际品牌库存接入。
禁止：新聊天框/登录/数据库、改 Gesture Engine、静默请求相册权限、复制许可证未核实的色卡、把截图当成原始抠图质量验收。

用户已要求持续完善当前 Demo；本轮按上述最简单的平面转换推进，无需 AppID 或外部 API。
