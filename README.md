# 体彩足球 H5

移动端友好的体彩竞彩足球赛程、联赛积分与球队对局记录页面，可部署到 GitHub Pages。

## 功能

| 页面 | 说明 |
|------|------|
| **赛程** | 当日体彩开售场次，支持 1/2/3 天筛选；显示北京时间、联赛、赔率、官方排名 |
| **比赛详情** | 点击赛程进入；展示胜平负/让球赔率、联赛排名、主客队对局记录 |
| **联赛积分** | 有赛果时按积分统计；否则展示体彩官方联赛排名；多联赛时子 Tab 切换 |
| **预测分析** | 检索体彩官方数据、市场赔率、Forebet 泊松模型，融合多源预测 |
| **自动更新** | 每天北京时间 11:00 自动抓取最新开售场次 |

## 本地预览

需要本地 HTTP 服务（ES Module 无法直接用 `file://` 打开）：

```bash
python -m http.server 8080
# 或
npx serve .
```

浏览器访问 `http://localhost:8080`

## 手动更新数据

```bash
node scripts/fetch-lottery.mjs
```

脚本会从体彩官方接口抓取当日开售场次，并尝试合并近 30 天赛果到 `data/lottery.json`。

## 部署到 GitHub Pages

1. 将本项目推送到 GitHub 仓库
2. 进入仓库 **Settings → Pages**
3. **Source** 选择 `Deploy from a branch`，分支 `main`，目录 `/ (root)`
4. 保存后访问 `https://<用户名>.github.io/<仓库名>/`

### 定时自动更新

仓库已配置 GitHub Actions（`.github/workflows/update-lottery.yml`）：

| 时间（北京时间） | 任务 |
|------------------|------|
| 每天 11:00 | 抓取当日体彩开售足球场次 |
| 每天 23:00 | 补抓赛果并合并历史记录 |

首次推送后需在仓库 **Settings → Actions → General → Workflow permissions** 中允许读写权限，以便 Actions 自动提交 `data/lottery.json`。

## 数据来源

- 赛程与赔率：中国体彩网 `webapi.sporttery.cn`（竞彩足球固定奖金接口）
- 内置备份：`data/lottery.json`（打开页面立即可用）
- 页面会在 11:00 后自动检索，也可点「立即检索」手动更新

## 技术说明

- 纯静态 HTML / CSS / JavaScript（无构建步骤）
- 移动端优先，最大宽度 480px
- 历史对局记录随每日抓取累积；浏览器端也会尝试拉取近 30 天赛果

## 许可

代码 MIT；体彩数据版权归中国体育彩票所有，仅供个人查阅。
