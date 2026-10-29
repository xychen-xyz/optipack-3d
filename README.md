# 📦 OptiPack 3D - 智能装箱与集装箱配载可视化系统

[![Three.js](https://img.shields.io/badge/Three.js-r128-black?logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/xychen-xyz/optipack-3d/pulls)

> **OptiPack 3D** 是一款基于 WebGL / Three.js 打造的纯前端轻量级 **3D 智能装箱配载与空间优化系统**。旨在帮助跨境出海、外贸建材、货运物流等领域快速计算集装箱（Container）装载率、模拟三维摆放逻辑、规避货物损耗并降低海运物流成本。

---

## ✨ 核心特性

- **🎮 3D 沉浸式空间渲染**：基于 Three.js 构建高保真三维集装箱场景，支持鼠标 360° 旋转、缩放、平移及视角复位。
- **🧠 3D 装箱启发式算法**：内置三维空间箱体规划算法（Bin Packing Problem），实时计算空间体积利用率（Volumetric Efficiency）与承重配比。
- **📦 多元货物混合装载**：
  - **长方体货物**：支持自定义长宽高、单重、是否允许翻转/旋转。
  - **圆柱体货物**：支持直径与长度计算，自动剔除易滚落姿态，仅允许防滚落竖放。
- **🚢 丰富集装箱/车辆预设**：
  - 40尺高柜 (40HQ / 40HQ.SPECIAL)
  - 40尺普柜 (40GP)
  - 20尺集装箱 (20GP)
  - 标准 4.2 米厢式货车 (TRUCK42)
  - 标准欧洲托盘 (PALLET)
  - 支持任意自定义容器尺寸与最大承重限制
- **📊 业务化集成与报表**：
  - **Excel 清单批量导入/导出**：一键导入 Excel 装箱明细。
  - **PDF 装箱方案生成**：导出可视化图谱与货运单据。
  - **新手引导与演示数据**：内置一键加载测试数据与分步引导流程。

---

## 🛠️ 技术栈

- **核心渲染**：[Three.js (r128)](https://threejs.org/) + OrbitControls + Tween.js
- **数据与报表**：`xlsx-js-style` (Excel 解析与样式化) + `html2pdf.js` (矢量装箱单导出)
- **UI & 样式**：现代暗黑玻璃拟态（Glassmorphism）设计、FontAwesome 6、Google Fonts
- **运行环境**：零后端依赖，任意静态服务器（GitHub Pages、Vercel、Nginx）即开即用

---

## 🚀 本地运行

本系统为纯静态应用，无需安装复杂的 Node.js 构建工具：

### 方式 1：Python 极简服务（推荐）
```bash
# 进入项目目录
cd optipack-3d

# 启动本地端口
python -m http.server 8080
```
在浏览器中打开 `http://localhost:8080` 即可体验。

### 方式 2：使用任意静态服务器
直接使用 VS Code 的 `Live Server` 扩展打开 `index.html` 即可。

---

## 📄 开源许可

本项目遵循 [MIT License](LICENSE) 协议开源。
