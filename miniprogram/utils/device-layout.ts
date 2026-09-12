/** Custom navigation uses screen px, not rpx or CSS safe-area guesses.
 * Official contracts: https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts
 */
export function getDeviceLayout() {
  const window = wx.getWindowInfo()
  let capsule: ReturnType<NonNullable<typeof wx.getMenuButtonBoundingClientRect>> | undefined
  try { capsule = wx.getMenuButtonBoundingClientRect?.() } catch { /* Simulator may not expose a capsule. */ }
  const navTop = window.statusBarHeight ?? 24
  const validCapsule = capsule && capsule.width > 0 && capsule.height > 0
    && capsule.left > 0 && capsule.left < window.windowWidth && capsule.top >= navTop
  const contentHeight = validCapsule ? Math.max(44, capsule.height + 2 * (capsule.top - navTop)) : 44
  return {
    navTop,
    navHeight: navTop + contentHeight,
    navRightInset: validCapsule ? window.windowWidth - capsule.left + 12 : 106,
    bottomInset: window.safeArea && window.screenHeight ? Math.max(0, window.screenHeight - window.safeArea.bottom) : 0,
  }
}
