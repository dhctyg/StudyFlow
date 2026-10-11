import { createApp } from 'vue'
import App from './App.vue'
import { init } from './store/schedule'
import { initSettings } from './store/settings'
import { initUiTheme } from './store/uiTheme'
// 字体声明最先加载，保证 @font-face 与令牌在首屏渲染前就绪
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'

// 先加载本地数据（含首次初始化的示例数据）、配置与 UI 主题，再挂载应用。
init()
initSettings()
initUiTheme()
createApp(App).mount('#app')
