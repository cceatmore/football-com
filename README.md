# 2026 世界杯 H5

移动端友好的 2026 FIFA 世界杯赛程、积分榜与出线形势分析页面，可部署到 GitHub Pages。

## 功能

| 页面 | 说明 |
|------|------|
| **赛程** | 未赛比赛列表，支持按 1/2/3 天或全部筛选；显示北京时间、当前积分、小组 |
| **球队详情** | 点击赛程中的比赛进入；展示主场球队上一轮战绩与下一轮对手 |
| **积分榜** | 12 个小组完整排名，球队名称带国旗 |
| **出线分析** | 自动计算各队出线形势：必须取胜 / 可接受平局 / 输赢无所谓 / 已出局 |

## 本地预览

需要本地 HTTP 服务（ES Module 无法直接用 `file://` 打开）：

```bash
# Python
python -m http.server 8080

# 或 Node.js
npx serve .
```

浏览器访问 `http://localhost:8080`

## 部署到 GitHub Pages

1. 将本项目推送到 GitHub 仓库
2. 进入仓库 **Settings → Pages**
3. **Source** 选择 `Deploy from a branch`
4. **Branch** 选择 `main`，目录选 `/ (root)`
5. 保存后访问 `https://<用户名>.github.io/<仓库名>/`

## 数据来源

- 赛程与比分：[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)（公共领域）
- 国旗图标：[flagcdn.com](https://flagcdn.com)
- 页面优先从 GitHub 拉取最新 JSON，失败时使用本地 `data/worldcup.json`

## 技术说明

- 纯静态 HTML / CSS / JavaScript（无构建步骤）
- 移动端优先，最大宽度 480px，浅色简约主题
- 出线分析基于小组剩余场次全枚举，判定能否进入**小组前两名**（不含 2026 新增的「最佳第三名」跨组比较）

## 许可

代码 MIT；世界杯数据遵循 openfootball 公共领域许可。
