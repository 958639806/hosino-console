# 星野·线标

控制台铬层图标的统一圆角线性 SVG 模块（`public/icons.js`、`public/icons.css`）。24×24 网格，线宽 1.8，`currentColor`，不使用 CDN。

## 来源

路径为 2026-11-17 针对本仓库重绘的原创图标，延续既有 `ic()` 约定。品牌标识 `public/icon.svg` 不在此表中，也未替换。

若与本仓库一并分发，跟随根目录 `LICENSE` 的 MIT 条款。本说明不引入其它第三方图标包授权。

## 对照图

这些图只展示图标本身，不含业务数据。

- [浅色旧/新对比](icons/compare-light.png)
- [深色旧/新对比](icons/compare-dark.png)
- [浅色图标库](icons/library-light.png)
- [深色图标库](icons/library-dark.png)

## 约定

- 装饰性 SVG 使用 `aria-hidden="true"`；纯图标按钮需要 `aria-label`
- 导航选中态可叠加少量实底（`.hs-fill`）
- 状态同时用形状和颜色区分
- 会话列表里用户自己的 emoji（`x.emoji`）保持原样
