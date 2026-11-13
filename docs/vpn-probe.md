# 宿主机 VPN 状态只读探查（<美国主机IP>，2026-10-20 16:0x UTC+8）
全程只读：未改配置、未重启/重载任何服务，未碰 xray 路由与 openclaw.ume.wiki 的 nginx/stream 配置。密钥/UUID 未输出，客户端 IP 只保留首段。

## 1. 装了什么
| 服务 | 类型 | 状态 | 启动时间(UTC+8) | 端口 |
|---|---|---|---|---|
| openclaw-xray-reality | Xray VLESS REALITY Vision（/usr/local/lib/openclaw-xray-reality-v1/xray，用户 openclaw-xray-reality） | active/running，pid 15614 | 2026-10-19 13:34:56（约 26.5h） | TCP *:8443 |
| openclaw-wireguard-la | WireGuard 接口 wg-la（python 脚本 /srv/openclaw-migration/... 拉起，oneshot） | active/exited，接口 UP | 2026-10-19 10:22:22 | UDP 51820 |
| openclaw-wireguard-phone | WireGuard 接口 wg-phone | active/exited，接口 UP | 2026-10-19 11:56:54 | UDP 51821 |
无 OpenVPN / sing-box / Hysteria / Tailscale。
配置：/etc/wireguard/wg-la.conf、wg-phone.conf（root 600）；xray 配置为 systemd credential /run/credentials/openclaw-xray-reality.service/config.json（root 440+ACL），1 个 VLESS 客户端。

## 2. 当前数据（root 读取）
WireGuard peer（握手距今 / 收 / 发）：
- wg-la：peer 120.x — 约 28h 前，18 MB / 92 MB
- wg-phone：peer 38.x — 约 26h 前，135 MB / 4.7 GB；peer 120.x — 约 7.6h 前，66 MB / 77 MB；另 2 个 peer 从未握手
- 按“3 分钟内握手=在线”：当前 0 在线
Xray：配置里**没有 api / stats / policy**，日志 access/error 均为 none → 无按用户流量、无日志可读。只能用 `ss` 数 8443 已建立 TCP 连接数（当前 59，含 REALITY 回落/探测，不等于用户数）。

## 3. 控制台（User=ubuntu）不用 root 能读到的
- systemd 状态：`systemctl show <unit> -p ActiveState,SubState,ActiveEnterTimestamp` ✅（启动时长、是否运行）
- 端口监听 / 8443 连接数：`ss -lnu` / `ss -tn` ✅
- 接口总流量：/sys/class/net/wg-*/statistics/{rx,tx}_bytes ✅（ubuntu 可读，已验证）
- `wg show`：❌ 需要 CAP_NET_ADMIN（ubuntu 执行报 Operation not permitted）
- xray 配置 / 统计：❌（无权限，且未开 stats）

## 4. 建议方案
1. 无需提权部分直接在 server.mjs 里读：systemctl show、/sys/class/net 计数、ss 计数。
2. peer 握手/流量：新建 root 所有、755 的 `/usr/local/sbin/hosino-wg-status`，内部只执行 `wg show all dump`，**丢弃私钥/预共享密钥列**，公钥截断为前 6 位，endpoint IP 只留首段，输出 JSON；sudoers 加一条 `ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hosino-wg-status`（无参数，visudo -c 校验）。控制台缓存 30s。
3. Xray 按用户流量：需要在配置里开 api+stats 并重启 xray，属改配置+影响 xray 路由，**不建议**；保持只显示服务状态 + 连接数。
以上 2 需要凛批准后才落地（写 /usr/local/sbin 与 /etc/sudoers.d）。
