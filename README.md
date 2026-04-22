# 周边国家好课 · Goodie Labs

好东西实验室出品的亚洲周边国家好课网站，数据源来自飞书多维表格。

## 项目结构

```
.
├── index.html                  # 网站主文件
├── netlify.toml                # Netlify 配置
└── netlify/
    └── functions/
        └── courses.js          # 飞书表格代理 API
```

## 部署

使用 Netlify 部署。需要在 Netlify 后台配置两个环境变量：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

## 数据更新

每周更新飞书表格后，网站会自动同步（5 分钟 CDN 缓存）。
