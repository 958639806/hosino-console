# OpenClaw 网关 RPC 方法与事件清单

来源：2026-10-20 15:14（UTC+8）以 backend/operator.admin 身份连接 wss://127.0.0.1:18789，`connect` 响应的 `features.methods`（488 个）与 `features.events`（64 个）；重启/重载标注依据 dist 代码 grep（config-*.mjs、restart-*.mjs、update-*.mjs、package-update-activation-recovery.mjs 中引用 restart 调度的处理器）及方法语义。

读/写为按方法名与已知处理器的判断，**未调用任何写方法**。⚠️ = 可能导致网关重启、插件重载或断开渠道，禁止在控制台随意调用。

## 方法

| 方法 | 读/写 | 重启/重载风险 |
|---|---|---|
| `agent` | 写/动作 |  |
| `agent.identity.get` | 读 |  |
| `agent.wait` | 读 |  |
| `agents.create` | 写/动作 |  |
| `agents.delete` | 写/动作 |  |
| `agents.files.get` | 读 |  |
| `agents.files.list` | 读 |  |
| `agents.files.set` | 写/动作 |  |
| `agents.list` | 读 |  |
| `agents.update` | 写/动作 |  |
| `agents.workspace.get` | 读 |  |
| `agents.workspace.list` | 读 |  |
| `approval.get` | 读 |  |
| `approval.history` | 读 |  |
| `approval.resolve` | 读 |  |
| `artifacts.download` | 读 |  |
| `artifacts.get` | 读 |  |
| `artifacts.list` | 读 |  |
| `attach.grant` | 写/动作 |  |
| `attach.revoke` | 写/动作 |  |
| `audit.activity.list` | 读 |  |
| `audit.list` | 读 |  |
| `audit.run.inspect` | 读 |  |
| `board.action` | 写/动作 |  |
| `board.data.read` | 读 |  |
| `board.event` | 写/动作 |  |
| `board.get` | 读 |  |
| `board.prompt.authorize` | 写/动作 |  |
| `board.update` | 写/动作 |  |
| `board.widget.appView` | 写/动作 |  |
| `board.widget.grant` | 写/动作 |  |
| `board.widget.put` | 写/动作 |  |
| `browser.dashboard.request` | 写/动作 |  |
| `browser.request` | 写/动作 |  |
| `canvas.document.preview` | 读 |  |
| `canvas.document.view` | 读 |  |
| `channels.logout` | 写/动作 | ⚠️ 渠道登出 |
| `channels.pairing.approve` | 写/动作 |  |
| `channels.pairing.dismiss` | 写/动作 |  |
| `channels.pairing.list` | 读 |  |
| `channels.start` | 写/动作 | 启动渠道（影响 QQ） |
| `channels.status` | 读 |  |
| `channels.stop` | 写/动作 | ⚠️ 停止渠道（会断 QQ） |
| `chat.abort` | 写/动作 |  |
| `chat.history` | 读 |  |
| `chat.message.get` | 读 |  |
| `chat.metadata` | 读 |  |
| `chat.send` | 写/动作 |  |
| `chat.startup` | 写/动作 |  |
| `chat.toolTitles` | 读 |  |
| `claws.monitors` | 读 |  |
| `claws.packages.remove` | 写/动作 |  |
| `codex.accountUsage` | 读 |  |
| `commands.list` | 读 |  |
| `computer.invoke` | 写/动作 |  |
| `computer.status` | 读 |  |
| `config.apply` | 写/动作 | ⚠️ 写配置→热重载，部分字段触发网关重启（代码含 restart 调度） |
| `config.get` | 读 |  |
| `config.patch` | 写/动作 | ⚠️ 同上 |
| `config.schema` | 读 |  |
| `config.schema.lookup` | 读 |  |
| `config.set` | 写/动作 | ⚠️ 同上 |
| `controlUi.githubDetail` | 读 |  |
| `controlUi.githubPreview` | 读 |  |
| `controlUi.linkPreview` | 读 |  |
| `controlUi.sessionPreview` | 读 |  |
| `controlUi.sessionPullRequests.checks` | 读 |  |
| `controlUi.sessionPullRequests.subscribe` | 读 |  |
| `conversations.list` | 读 |  |
| `conversations.send` | 写/动作 |  |
| `conversations.turn` | 写/动作 |  |
| `conversations.turn.cancel` | 写/动作 |  |
| `cron.add` | 写/动作 |  |
| `cron.get` | 读 |  |
| `cron.history` | 读 |  |
| `cron.list` | 读 |  |
| `cron.remove` | 写/动作 |  |
| `cron.run` | 写/动作 |  |
| `cron.runs` | 读 |  |
| `cron.scratch.get` | 读 |  |
| `cron.scratch.set` | 写/动作 |  |
| `cron.status` | 读 |  |
| `cron.update` | 写/动作 |  |
| `desktop.launch` | 写/动作 |  |
| `desktop.observe` | 写/动作 |  |
| `desktop.release` | 写/动作 |  |
| `device.pair.approve` | 写/动作 |  |
| `device.pair.list` | 读 |  |
| `device.pair.reject` | 写/动作 |  |
| `device.pair.remove` | 写/动作 |  |
| `device.pair.rename` | 写/动作 |  |
| `device.scopes.requestUpgrade` | 写/动作 |  |
| `device.scopes.waitUpgrade` | 写/动作 |  |
| `device.token.revoke` | 写/动作 |  |
| `device.token.rotate` | 写/动作 |  |
| `diagnostics.cpuProfile` | 写/动作 |  |
| `diagnostics.heapProfile` | 写/动作 |  |
| `diagnostics.heapSnapshot` | 写/动作 |  |
| `diagnostics.lanes` | 读 |  |
| `diagnostics.stability` | 读 |  |
| `doctor.memory.backfillDreamDiary` | 读 |  |
| `doctor.memory.dedupeDreamDiary` | 读 |  |
| `doctor.memory.dreamDiary` | 读 |  |
| `doctor.memory.repairDreamingArtifacts` | 读 |  |
| `doctor.memory.resetDreamDiary` | 读 |  |
| `doctor.memory.resetGroundedShortTerm` | 读 |  |
| `doctor.memory.status` | 读 |  |
| `environments.create` | 写/动作 |  |
| `environments.destroy` | 写/动作 |  |
| `environments.list` | 读 |  |
| `environments.prepare` | 写/动作 |  |
| `environments.session.create` | 写/动作 |  |
| `environments.session.destroy` | 写/动作 |  |
| `environments.session.exec` | 写/动作 |  |
| `environments.session.status` | 读 |  |
| `environments.status` | 读 |  |
| `exec.approval.get` | 读 |  |
| `exec.approval.grants.list` | 读 |  |
| `exec.approval.grants.revoke` | 写/动作 |  |
| `exec.approval.list` | 读 |  |
| `exec.approval.request` | 写/动作 |  |
| `exec.approval.resolve` | 读 |  |
| `exec.approval.waitDecision` | 写/动作 |  |
| `exec.approvals.get` | 读 |  |
| `exec.approvals.node.get` | 读 |  |
| `exec.approvals.node.set` | 写/动作 |  |
| `exec.approvals.set` | 写/动作 |  |
| `fs.listDir` | 读 |  |
| `gateway.identity.get` | 读 |  |
| `gateway.restart.preflight` | 写/动作 | 重启前检查（只读，但属重启流程） |
| `gateway.restart.request` | 写/动作 | ⚠️ 重启网关 |
| `gateway.stop.request` | 写/动作 | ⚠️ 停止网关 |
| `gateway.suspend.handoff` | 写/动作 | ⚠️ 挂起/交接网关 |
| `gateway.suspend.prepare` | 写/动作 | ⚠️ 挂起/交接网关 |
| `gateway.suspend.resume` | 写/动作 | ⚠️ 恢复网关 |
| `gateway.suspend.status` | 读 |  |
| `health` | 读 |  |
| `hooks.status` | 读 |  |
| `last-heartbeat` | 读 |  |
| `logs.tail` | 读 |  |
| `mcp.app.callTool` | 写/动作 |  |
| `mcp.app.listResourceTemplates` | 读 |  |
| `mcp.app.listResources` | 读 |  |
| `mcp.app.listTools` | 读 |  |
| `mcp.app.readResource` | 读 |  |
| `mcp.app.updateModelContext` | 写/动作 |  |
| `mcp.app.view` | 写/动作 |  |
| `memory.search` | 读 |  |
| `mentions.dismiss` | 写/动作 |  |
| `mentions.list` | 读 |  |
| `message.action` | 写/动作 |  |
| `migrations.memory.apply` | 读 |  |
| `migrations.memory.plan` | 读 |  |
| `models.authLogin` | 写/动作 | 写凭据 |
| `models.authLogout` | 写/动作 | 写凭据 |
| `models.authOrderSet` | 写/动作 | 写凭据顺序 |
| `models.authRefresh` | 写/动作 | 刷新凭据 |
| `models.authSetApiKey` | 写/动作 | 写凭据 |
| `models.authStatus` | 读 |  |
| `models.list` | 读 |  |
| `models.probe` | 读 |  |
| `node.describe` | 读 |  |
| `node.event` | 写/动作 |  |
| `node.invoke` | 写/动作 |  |
| `node.invoke.progress` | 写/动作 |  |
| `node.invoke.result` | 写/动作 |  |
| `node.list` | 读 |  |
| `node.pair.approve` | 写/动作 |  |
| `node.pair.list` | 读 |  |
| `node.pair.reject` | 写/动作 |  |
| `node.pair.remove` | 写/动作 |  |
| `node.pending.ack` | 写/动作 |  |
| `node.pending.drain` | 写/动作 |  |
| `node.pending.enqueue` | 写/动作 |  |
| `node.pending.pull` | 写/动作 |  |
| `node.pluginSurface.refresh` | 写/动作 | 插件表面刷新 |
| `node.pluginTools.update` | 写/动作 |  |
| `node.rename` | 写/动作 |  |
| `node.skills.update` | 写/动作 |  |
| `openclaw.approval.list` | 读 |  |
| `openclaw.changes.list` | 读 |  |
| `openclaw.chat` | 写/动作 |  |
| `openclaw.chat.history` | 读 |  |
| `openclaw.setup.activate` | 写/动作 | ⚠️ 安装/激活流程 |
| `openclaw.setup.activate.start` | 写/动作 |  |
| `openclaw.setup.auth.start` | 写/动作 |  |
| `openclaw.setup.detect` | 写/动作 |  |
| `openclaw.setup.prepare.start` | 写/动作 |  |
| `openclaw.setup.verify` | 写/动作 |  |
| `plugin.approval.list` | 读 |  |
| `plugin.approval.request` | 写/动作 |  |
| `plugin.approval.resolve` | 读 |  |
| `plugin.approval.waitDecision` | 写/动作 |  |
| `plugin.surface.refresh` | 写/动作 | 插件表面刷新 |
| `plugins.catalog.browse` | 读 |  |
| `plugins.catalog.categories` | 读 |  |
| `plugins.catalog.get` | 读 |  |
| `plugins.controlUi.list` | 读 |  |
| `plugins.controlUi.reload` | 写/动作 | 控制台 UI 插件重载 |
| `plugins.controlUi.report` | 写/动作 |  |
| `plugins.controlUi.status` | 读 |  |
| `plugins.credentials.inspect` | 读 |  |
| `plugins.inspect` | 读 |  |
| `plugins.install` | 写/动作 | ⚠️ 插件重载 |
| `plugins.list` | 读 |  |
| `plugins.refresh` | 写/动作 | ⚠️ 插件刷新 |
| `plugins.reload` | 写/动作 | ⚠️ 插件重载 |
| `plugins.search` | 读 |  |
| `plugins.sessionAction` | 写/动作 |  |
| `plugins.setEnabled` | 写/动作 | ⚠️ 插件重载/可能重启 |
| `plugins.skills.read` | 读 |  |
| `plugins.uiDescriptors` | 读 |  |
| `plugins.uninstall` | 写/动作 | ⚠️ 插件重载 |
| `portal.close` | 写/动作 |  |
| `portal.list` | 读 |  |
| `portal.open` | 写/动作 |  |
| `portal.session.close` | 写/动作 |  |
| `portal.session.list` | 读 |  |
| `portal.session.open` | 写/动作 |  |
| `presence.activity` | 写/动作 |  |
| `presence.query` | 读 |  |
| `progressCard.get` | 读 |  |
| `progressCard.put` | 写/动作 |  |
| `progressCard.refresh` | 写/动作 |  |
| `projects.add` | 写/动作 |  |
| `projects.list` | 读 |  |
| `projects.register` | 写/动作 |  |
| `projects.remove` | 写/动作 |  |
| `projects.searchRemote` | 读 |  |
| `push.web.preferences.get` | 读 |  |
| `push.web.preferences.set` | 写/动作 |  |
| `question.get` | 读 |  |
| `question.list` | 读 |  |
| `question.request` | 写/动作 |  |
| `question.resolve` | 读 |  |
| `question.waitAnswer` | 写/动作 |  |
| `secrets.reload` | 写/动作 | ⚠️ 重新加载密钥（代码与 restart 模块相连） |
| `secrets.resolve` | 读 |  |
| `secrets.store.delete` | 写/动作 | 删密钥，可能触发重载 |
| `secrets.store.list` | 读 |  |
| `secrets.store.set` | 写/动作 | 写密钥，可能触发重载 |
| `send` | 写/动作 |  |
| `session.discussion.info` | 读 |  |
| `session.discussion.open` | 写/动作 |  |
| `session.members.add` | 读 |  |
| `session.members.list` | 读 |  |
| `session.members.listEvidence` | 读 |  |
| `session.members.remove` | 读 |  |
| `session.publicShare.set` | 写/动作 |  |
| `session.suggestions.add` | 写/动作 |  |
| `session.suggestions.list` | 读 |  |
| `session.suggestions.resolve` | 读 |  |
| `session.typing` | 写/动作 |  |
| `session.visibility.set` | 写/动作 |  |
| `sessions.abort` | 写/动作 |  |
| `sessions.activitySummary.ensure` | 写/动作 |  |
| `sessions.assignOwner` | 写/动作 |  |
| `sessions.branches.list` | 读 |  |
| `sessions.branches.switch` | 写/动作 |  |
| `sessions.catalog.archive` | 读 |  |
| `sessions.catalog.continue` | 读 |  |
| `sessions.catalog.list` | 读 |  |
| `sessions.catalog.read` | 读 |  |
| `sessions.catalog.startTerminal` | 读 |  |
| `sessions.cleanup` | 写/动作 |  |
| `sessions.compact` | 写/动作 |  |
| `sessions.companion.ask` | 写/动作 |  |
| `sessions.companion.reset` | 写/动作 |  |
| `sessions.companion.state` | 读 |  |
| `sessions.create` | 写/动作 |  |
| `sessions.delete` | 写/动作 |  |
| `sessions.describe` | 读 |  |
| `sessions.diff` | 读 |  |
| `sessions.dispatch` | 写/动作 |  |
| `sessions.files.get` | 读 |  |
| `sessions.files.list` | 读 |  |
| `sessions.files.reveal` | 写/动作 |  |
| `sessions.files.set` | 写/动作 |  |
| `sessions.fork` | 写/动作 |  |
| `sessions.github.confirm` | 写/动作 |  |
| `sessions.github.options` | 读 |  |
| `sessions.github.publish` | 写/动作 |  |
| `sessions.github.status` | 读 |  |
| `sessions.goal.clear` | 写/动作 |  |
| `sessions.goal.update` | 写/动作 |  |
| `sessions.groups.defaults` | 读 |  |
| `sessions.groups.delete` | 写/动作 |  |
| `sessions.groups.list` | 读 |  |
| `sessions.groups.put` | 写/动作 |  |
| `sessions.groups.rename` | 写/动作 |  |
| `sessions.groups.update` | 写/动作 |  |
| `sessions.list` | 读 |  |
| `sessions.messages.subscribe` | 读 |  |
| `sessions.messages.unsubscribe` | 读 |  |
| `sessions.move` | 写/动作 |  |
| `sessions.observer.visibility` | 写/动作 |  |
| `sessions.patch` | 写/动作 |  |
| `sessions.patchMany` | 写/动作 |  |
| `sessions.pluginPatch` | 写/动作 |  |
| `sessions.preview` | 读 |  |
| `sessions.providerReview.continue` | 写/动作 |  |
| `sessions.reclaim` | 写/动作 |  |
| `sessions.recover` | 写/动作 |  |
| `sessions.reset` | 写/动作 |  |
| `sessions.rewind` | 写/动作 |  |
| `sessions.search` | 读 |  |
| `sessions.send` | 写/动作 |  |
| `sessions.setInvolvement` | 写/动作 |  |
| `sessions.storage.run` | 写/动作 |  |
| `sessions.storage.status` | 读 |  |
| `sessions.subscribe` | 读 |  |
| `sessions.title.prepare` | 写/动作 |  |
| `sessions.viewers.set` | 写/动作 |  |
| `set-heartbeats` | 写/动作 |  |
| `skills.bins` | 读 |  |
| `skills.curator.pin` | 写/动作 |  |
| `skills.curator.restore` | 写/动作 |  |
| `skills.curator.status` | 读 |  |
| `skills.curator.unpin` | 写/动作 |  |
| `skills.detail` | 读 |  |
| `skills.install` | 写/动作 | 安装技能，可能刷新技能集 |
| `skills.library.activate` | 写/动作 |  |
| `skills.library.import` | 写/动作 |  |
| `skills.library.list` | 读 |  |
| `skills.library.mutate` | 写/动作 |  |
| `skills.library.read` | 读 |  |
| `skills.library.save` | 写/动作 |  |
| `skills.library.upload` | 写/动作 |  |
| `skills.proposals.apply` | 写/动作 |  |
| `skills.proposals.create` | 写/动作 |  |
| `skills.proposals.evaluate` | 写/动作 |  |
| `skills.proposals.events.list` | 读 |  |
| `skills.proposals.historyScan` | 读 |  |
| `skills.proposals.historyStatus` | 读 |  |
| `skills.proposals.inspect` | 读 |  |
| `skills.proposals.list` | 读 |  |
| `skills.proposals.quarantine` | 写/动作 |  |
| `skills.proposals.reject` | 写/动作 |  |
| `skills.proposals.requestRevision` | 写/动作 |  |
| `skills.proposals.revise` | 写/动作 |  |
| `skills.proposals.update` | 写/动作 |  |
| `skills.search` | 读 |  |
| `skills.securityVerdicts` | 读 |  |
| `skills.skillCard` | 读 |  |
| `skills.status` | 读 |  |
| `skills.update` | 写/动作 |  |
| `skills.upload.begin` | 写/动作 |  |
| `skills.upload.chunk` | 写/动作 |  |
| `skills.upload.commit` | 写/动作 |  |
| `skills.workshop.read` | 读 |  |
| `status` | 读 |  |
| `system-event` | 写/动作 |  |
| `system-presence` | 写/动作 |  |
| `system.info` | 读 |  |
| `talk.catalog` | 读 |  |
| `talk.client.close` | 写/动作 |  |
| `talk.client.create` | 写/动作 |  |
| `talk.client.steer` | 写/动作 |  |
| `talk.client.toolCall` | 写/动作 |  |
| `talk.client.transcript` | 写/动作 |  |
| `talk.config` | 读 |  |
| `talk.mode` | 写/动作 |  |
| `talk.session.acknowledgeMark` | 写/动作 |  |
| `talk.session.appendAudio` | 写/动作 |  |
| `talk.session.cancelOutput` | 写/动作 |  |
| `talk.session.close` | 写/动作 |  |
| `talk.session.create` | 写/动作 |  |
| `talk.session.steer` | 写/动作 |  |
| `talk.session.submitToolResult` | 写/动作 |  |
| `talk.speak` | 写/动作 |  |
| `talk.voice.complete` | 写/动作 |  |
| `talk.voice.get` | 读 |  |
| `talk.voice.set` | 写/动作 |  |
| `taskSuggestions.accept` | 写/动作 |  |
| `taskSuggestions.create` | 写/动作 |  |
| `taskSuggestions.dismiss` | 写/动作 |  |
| `taskSuggestions.list` | 读 |  |
| `terminal.attach` | 写/动作 |  |
| `terminal.close` | 写/动作 |  |
| `terminal.input` | 写/动作 |  |
| `terminal.list` | 读 |  |
| `terminal.open` | 写/动作 |  |
| `terminal.resize` | 写/动作 |  |
| `terminal.upload` | 写/动作 |  |
| `themes.get` | 读 |  |
| `themes.import` | 写/动作 |  |
| `themes.list` | 读 |  |
| `themes.set` | 写/动作 |  |
| `tools.catalog` | 读 |  |
| `tools.effective` | 读 |  |
| `tools.github.authorize.cancel` | 写/动作 |  |
| `tools.github.authorize.poll` | 读 |  |
| `tools.github.authorize.start` | 写/动作 |  |
| `tools.github.configure` | 写/动作 |  |
| `tools.github.status` | 读 |  |
| `tools.invoke` | 写/动作 |  |
| `transcripts.export` | 读 |  |
| `transcripts.get` | 读 |  |
| `transcripts.list` | 读 |  |
| `transcripts.status` | 读 |  |
| `transcripts.summarize` | 写/动作 |  |
| `tts.convert` | 写/动作 |  |
| `tts.disable` | 写/动作 |  |
| `tts.enable` | 写/动作 |  |
| `tts.personas` | 读 |  |
| `tts.providers` | 读 |  |
| `tts.setPersona` | 写/动作 |  |
| `tts.setProvider` | 写/动作 |  |
| `tts.speak` | 写/动作 |  |
| `tts.status` | 读 |  |
| `ui.command` | 写/动作 |  |
| `update.hold` | 写/动作 | 影响升级流程 |
| `update.report` | 写/动作 |  |
| `update.run` | 写/动作 | ⚠️ 升级，可能重启网关 |
| `update.runs.get` | 读 |  |
| `update.runs.list` | 读 |  |
| `update.status` | 读 |  |
| `usage.cost` | 读 |  |
| `usage.status` | 读 |  |
| `users.authConnect.answer` | 写/动作 |  |
| `users.authConnect.cancel` | 写/动作 |  |
| `users.authConnect.catalog` | 读 |  |
| `users.authConnect.start` | 写/动作 |  |
| `users.authConnect.status` | 读 |  |
| `users.github.authorize.cancel` | 写/动作 |  |
| `users.github.authorize.poll` | 读 |  |
| `users.github.authorize.start` | 写/动作 |  |
| `users.github.disconnect` | 写/动作 |  |
| `users.github.status` | 读 |  |
| `users.linkAuthProfile` | 写/动作 |  |
| `users.linkChannelIdentity` | 写/动作 |  |
| `users.linkEmail` | 写/动作 |  |
| `users.list` | 读 |  |
| `users.listAuthLinks` | 读 |  |
| `users.listChannelIdentities` | 读 |  |
| `users.listModelAccounts` | 读 |  |
| `users.mentionable` | 读 |  |
| `users.merge` | 读 |  |
| `users.personalFile.get` | 读 |  |
| `users.personalFile.set` | 写/动作 |  |
| `users.prefs.get` | 读 |  |
| `users.prefs.set` | 写/动作 |  |
| `users.selectModelAccount` | 写/动作 |  |
| `users.self` | 读 |  |
| `users.setAvatar` | 写/动作 |  |
| `users.setDisplayName` | 写/动作 |  |
| `users.setRole` | 写/动作 |  |
| `users.unlinkAuthProfile` | 写/动作 |  |
| `users.unlinkChannelIdentity` | 写/动作 |  |
| `voicewake.get` | 读 |  |
| `voicewake.routing.get` | 读 |  |
| `voicewake.set` | 写/动作 |  |
| `wake` | 写/动作 |  |
| `web.login.start` | 写/动作 |  |
| `web.login.wait` | 写/动作 |  |
| `webSearch.status` | 读 |  |
| `webSearch.test` | 写/动作 |  |
| `wiki.apply` | 写/动作 |  |
| `wiki.bridge.import` | 写/动作 |  |
| `wiki.compile` | 写/动作 |  |
| `wiki.doctor` | 读 |  |
| `wiki.get` | 读 |  |
| `wiki.importInsights` | 写/动作 |  |
| `wiki.importRuns` | 写/动作 |  |
| `wiki.ingest` | 写/动作 |  |
| `wiki.init` | 写/动作 |  |
| `wiki.lint` | 读 |  |
| `wiki.obsidian.command` | 写/动作 |  |
| `wiki.obsidian.daily` | 写/动作 |  |
| `wiki.obsidian.open` | 写/动作 |  |
| `wiki.obsidian.search` | 读 |  |
| `wiki.obsidian.status` | 读 |  |
| `wiki.overview` | 读 |  |
| `wiki.search` | 读 |  |
| `wiki.status` | 读 |  |
| `wiki.unsafeLocal.import` | 写/动作 |  |
| `wizard.cancel` | 写/动作 |  |
| `wizard.next` | 写/动作 |  |
| `wizard.start` | 写/动作 | 引导向导，可能写配置 |
| `wizard.status` | 读 |  |
| `worker.desktop.launch` | 写/动作 |  |
| `worker.desktop.observe` | 写/动作 |  |
| `worktrees.branches` | 读 |  |
| `worktrees.create` | 写/动作 |  |
| `worktrees.gc` | 写/动作 |  |
| `worktrees.list` | 读 |  |
| `worktrees.remove` | 写/动作 |  |
| `worktrees.restore` | 写/动作 |  |

## 事件

- `agent`
- `chat`
- `chat.metadata.changed`
- `connect.challenge`
- `controlUi.sessionPullRequests.changed`
- `cron`
- `device.pair.changed`
- `device.pair.requested`
- `device.pair.resolved`
- `device.pair.setup.completed`
- `device.pair.setup.deliveryUncertain`
- `exec.approval.requested`
- `exec.approval.resolved`
- `gateway.suspension`
- `health`
- `heartbeat`
- `mentions.changed`
- `models.snapshot`
- `node.hostStats`
- `node.invoke.cancel`
- `node.invoke.input`
- `node.invoke.request`
- `node.pair.requested`
- `node.pair.resolved`
- `node.presence`
- `node.runnerInventory.changed`
- `openclaw.approval.requested`
- `openclaw.approval.resolved`
- `plugin.approval.requested`
- `plugin.approval.resolved`
- `plugins.changed`
- `plugins.controlUi.changed`
- `plugins.install.progress`
- `portal.changed`
- `presence`
- `progressCard.changed`
- `question.requested`
- `question.resolved`
- `session.approval`
- `session.message`
- `session.narration`
- `session.observer`
- `session.operation`
- `session.sharing`
- `session.sharing.evidence`
- `session.suggestion`
- `session.tool`
- `session.typing`
- `sessions.changed`
- `shutdown`
- `skills.changed`
- `talk.event`
- `talk.mode`
- `talk.voice.change`
- `task.suggestion`
- `terminal.data`
- `terminal.exit`
- `tick`
- `ui.command`
- `update.available`
- `update.run.changed`
- `users.prefs.changed`
- `voicewake.changed`
- `voicewake.routing.changed`

## 统计
- 方法 488：读 210，写/动作 278；标注风险 33

