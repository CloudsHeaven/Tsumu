(function(global) {
  "use strict";
  if (!global.tsumuShell) return;
  function build() {
    var bar = document.getElementById("bar");
    if (!bar || document.getElementById("winctl")) return;
    var ctl = document.createElement("div");
    ctl.id = "winctl";
    var mk = function(id, glyph, titleKey, titleFallback) {
      var b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.className = "icon-btn win-btn";
      b.textContent = glyph;
      b.setAttribute("data-i18n-title", titleKey);
      b.title = global.I18n && I18n.t ? I18n.t(titleKey) : titleFallback;
      ctl.appendChild(b);
      return b;
    };
    var pin = mk("win-pin", "⤒", "win.pin", "窗口置顶");
    var min = mk("win-min", "—", "win.min", "最小化");
    var cls = mk("win-close", "✕", "win.close", "关闭");
    bar.appendChild(ctl);
    try {
      if (global.I18n && I18n.apply) I18n.apply(ctl);
    } catch (e) {
    }
    pin.onclick = function() {
      global.tsumuShell.setTopmost(!pin.classList.contains("on")).then(function(on) {
        pin.classList.toggle("on", !!on);
      });
    };
    min.onclick = function() {
      global.tsumuShell.minimize();
    };
    cls.onclick = function() {
      global.tsumuShell.close();
    };
    global.tsumuShell.isTopmost().then(function(on) {
      pin.classList.toggle("on", !!on);
    });
    document.body.classList.add("shell-electron");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})(window);
