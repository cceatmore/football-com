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

- 原始数据：[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)（公共领域）
- 内置备份：`data/worldcup.json`（打开页面立即可用）
- 国旗：Unicode emoji（无需外网 CDN）

### 自动检索

页面会**并行请求多个镜像**，自动选用完赛场次最多的一份：

| 优先级 | 来源 |
|--------|------|
| 同站 | `./data/worldcup.json` |
| 国内镜像 | `cdn.jsdmirror.com`（jsDelivr 国内节点） |
| CDN | jsDelivr、Statically |
| GitHub 加速 | ghproxy.net、gh-proxy.com |
| 原始 | raw.githubusercontent.com |

- 打开页面：先显示内置数据，后台自动检索更新
- 每 **3 分钟**自动检索一次（切回页面时也会触发）
- 可点「立即检索」手动更新

更新内置备份：在可访问外网的环境下载最新 JSON 覆盖 `data/worldcup.json` 后推送。

## 技术说明

- 纯静态 HTML / CSS / JavaScript（无构建步骤）
- 移动端优先，最大宽度 480px，浅色简约主题
- 出线分析基于小组剩余场次全枚举，判定能否进入**小组前两名**（不含 2026 新增的「最佳第三名」跨组比较）

## 许可

代码 MIT；世界杯数据遵循 openfootball 公共领域许可。
