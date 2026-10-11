# 火炬导师头像素材

供网页和协作 AI 按角色与特性调用。清单见 [manifest.json](./manifest.json)，包含中文名、稳定 ID、相对路径、原始来源、尺寸、SHA-256 和公开图片 URL。

- `heroes/`：2026-10-10 官网素材快照裁切的 512 × 512 胸部头像，按特性分别存放。
- `mentors/`：现有网页原型使用的米娅、诗雨、雷娜图像，保留原图尺寸；名称及 ID 以清单为准。

## 直接调用

清单：`https://raw.githubusercontent.com/xiaoyihuang0503-cyber/torchlightskill-web/main/assets/torchlight-mentor-avatars/manifest.json`

例如英雄头像：`https://raw.githubusercontent.com/xiaoyihuang0503-cyber/torchlightskill-web/main/assets/torchlight-mentor-avatars/heroes/youga_1.png`

例如导师头像：`https://raw.githubusercontent.com/xiaoyihuang0503-cyber/torchlightskill-web/main/assets/torchlight-mentor-avatars/mentors/shiyu.png`

同站部署请使用清单中的 `repository_path` 加前导 `/`；子目录部署时也可计算正确的相对路径。独立部署可使用 `raw_url`，固定版本时把 URL 中的 `main` 替换成该次提交 SHA。

```js
const manifest = await fetch('/assets/torchlight-mentor-avatars/manifest.json').then(r => r.json());
const portrait = manifest.assets.find(a => a.type === 'hero' && a.id === 'youga_1');
if (portrait) img.src = '/' + portrait.repository_path;
```

## 使用边界

英雄头像按 `trait` / `id` 匹配，不能仅凭英雄名匹配所有特性。素材来自官网英雄模块；此快照不证明与 SS14 新模型完全一致。吉玛·冰结之心、卡里诺·至暗掠影、宾·爆破新星的新视觉一致性待确认，不能用旧图冒充确认过的新版。官网 `carino_2` 历史源标签与业务使用名可能不同，请保留 ID，名称以当前业务确认值为准。

部分原设有面罩或遮挡，`covered_face` 保留来源记录；未重新绘制或修改脸部。导师图片保留现有原型资产，未独立核验原始授权。图片权利归各原权利人，本目录不授予额外商用或再分发许可。

只提供图片和清单；未接入账号、模型、游戏数据或自动更新。没有上传用户头像、日志、凭据、原始项目文件或 QA 中间图。
