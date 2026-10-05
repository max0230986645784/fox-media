#!/usr/bin/python3
"""Genere le theme d'icones Nox (pictogrammes blancs filaires, style Lucide) dans linux/icons/nox.
Usage : mknoxicons.py <dossier lucide/icons> <sortie>
Lucide : https://lucide.dev — licence ISC (c) Lucide Contributors."""
import os, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]
COLOR, WIDTH = "#ece8ff", "1.6"

# nom freedesktop/KDE -> icone Lucide
MAP = {
 "apps": {
  "utilities-terminal": "square-terminal", "org.kde.konsole": "square-terminal", "konsole": "square-terminal",
  "web-browser": "globe", "firefox-esr": "globe", "firefox": "globe", "internet-web-browser": "globe",
  "system-file-manager": "folder", "org.kde.dolphin": "folder",
  "systemsettings": "settings-2", "preferences-system": "settings-2", "org.kde.systemsettings": "settings-2",
  "accessories-text-editor": "file-text", "org.kde.kate": "file-text", "kate": "file-text", "text-editor": "file-text",
  "org.kde.gwenview": "image", "gwenview": "image", "multimedia-photo-viewer": "image",
  "internet-mail": "mail", "mail-client": "mail", "office-calendar": "calendar", "org.kde.korganizer": "calendar",
  "clock": "clock", "org.kde.plasma.digitalclock": "clock", "preferences-system-time": "clock",
  "camera-web": "video", "camera-photo": "camera", "cheese": "video",
  "multimedia-audio-player": "music", "org.kde.elisa": "music", "vlc": "film", "multimedia-video-player": "film",
  "system-search": "search", "preferences-desktop-notification": "bell", "preferences-desktop-notification-bell": "bell",
  "security-high": "shield", "preferences-system-privacy": "shield", "folder-download": "download",
  "printer": "printer", "preferences-desktop-display": "monitor", "video-display": "monitor",
  "audio-input-microphone": "mic", "applications-all": "layout-grid", "applications-other": "layout-grid",
  "input-gaming": "gamepad-2", "applications-games": "gamepad-2", "nox-gamemode": "gamepad-2",
  "nox-centre": "layout-grid", "user-trash": "trash", "system-help": "info", "help-about": "info",
  "preferences-desktop-keyboard": "keyboard", "input-mouse": "mouse", "drive-harddisk": "hard-drive",
  "preferences-desktop-wallpaper": "image", "preferences-desktop-theme": "palette", "preferences-desktop-color": "palette",
  "network-wireless": "wifi", "preferences-system-network": "wifi", "preferences-system-bluetooth": "bluetooth",
  "battery": "battery-medium", "preferences-system-power-management": "battery-medium", "preferences-desktop-sound": "volume-2",
  "audio-headphones": "headphones", "system-users": "users", "user-identity": "user", "preferences-desktop-user": "user",
  "cpu": "cpu", "utilities-system-monitor": "cpu", "org.kde.plasma-systemmonitor": "cpu", "system-software-update": "refresh-cw",
  "system-software-install": "package", "org.kde.discover": "package", "internet-chat": "message-square", "discord": "message-square",
  "accessories-calculator": "calculator", "org.kde.kcalc": "calculator", "accessories-screenshot": "camera", "org.kde.spectacle": "camera",
  "utilities-file-archiver": "archive", "org.kde.ark": "archive", "code": "code", "text-x-script": "code",
 },
 "actions": {
  "system-shutdown": "power", "system-reboot": "rotate-cw", "system-suspend": "moon", "system-suspend-hibernate": "zzz",
  "system-lock-screen": "lock", "system-log-out": "log-out", "system-switch-user": "users",
  "edit-find": "search", "search": "search", "edit-delete": "trash", "edit-copy": "copy", "edit-paste": "clipboard",
  "edit-cut": "scissors", "edit-undo": "undo-2", "edit-redo": "redo-2", "document-save": "save", "document-open": "folder-open",
  "document-new": "file-plus", "list-add": "plus", "list-remove": "minus", "window-close": "x", "dialog-close": "x",
  "window-minimize": "minus", "window-maximize": "square", "go-home": "house", "go-previous": "arrow-left", "go-next": "arrow-right",
  "go-up": "arrow-up", "go-down": "arrow-down", "arrow-down": "chevron-down", "arrow-up": "chevron-up", "arrow-left": "chevron-left", "arrow-right": "chevron-right",
  "view-refresh": "refresh-cw", "configure": "settings-2", "settings-configure": "settings-2", "media-playback-start": "play",
  "media-playback-pause": "pause", "media-playback-stop": "square", "media-skip-forward": "skip-forward", "media-skip-backward": "skip-back",
  "zoom-in": "zoom-in", "zoom-out": "zoom-out", "bookmarks": "star", "favorite": "heart", "download": "download", "help-about": "info",
  "dialog-ok": "check", "dialog-cancel": "x", "application-menu": "menu", "open-menu": "menu", "view-list-details": "list", "view-list-icons": "layout-grid",
  "edit-rename": "pencil", "document-edit": "pencil", "mail-send": "send", "audio-volume-high": "volume-2", "audio-volume-medium": "volume-1",
  "audio-volume-low": "volume", "audio-volume-muted": "volume-x", "microphone-sensitivity-high": "mic", "microphone-sensitivity-muted": "mic-off",
 },
 "status": {
  "network-wireless": "wifi", "network-wireless-connected": "wifi", "network-wireless-signal-excellent": "wifi", "network-wireless-signal-good": "wifi",
  "network-wireless-signal-ok": "wifi", "network-wireless-signal-weak": "wifi", "network-wireless-disconnected": "wifi-off",
  "network-wired": "cable", "network-wired-activated": "cable", "network-offline": "wifi-off", "network-connect": "wifi",
  "preferences-system-bluetooth": "bluetooth", "bluetooth-active": "bluetooth", "bluetooth-disabled": "bluetooth-off",
  "battery-full": "battery-full", "battery-good": "battery-medium", "battery-low": "battery-low", "battery-caution": "battery-warning",
  "battery-empty": "battery-warning", "battery-charging": "battery-charging", "battery-full-charging": "battery-charging",
  "battery-good-charging": "battery-charging", "battery-low-charging": "battery-charging", "battery-missing": "plug",
  "audio-volume-high": "volume-2", "audio-volume-medium": "volume-1", "audio-volume-low": "volume", "audio-volume-muted": "volume-x",
  "microphone-sensitivity-high": "mic", "microphone-sensitivity-medium": "mic", "microphone-sensitivity-low": "mic", "microphone-sensitivity-muted": "mic-off",
  "dialog-information": "info", "dialog-warning": "triangle-alert", "dialog-error": "circle-x", "dialog-question": "circle-help",
  "notifications": "bell", "notifications-disabled": "bell-off", "security-high": "shield-check", "security-medium": "shield", "security-low": "shield-alert",
  "user-trash": "trash", "user-trash-full": "trash", "display-brightness": "sun", "video-display-brightness": "sun", "keyboard-brightness": "sun",
  "input-keyboard": "keyboard", "input-mouse": "mouse", "device-notifier": "usb", "drive-removable-media": "usb", "media-removable": "usb",
  "printer": "printer", "video-display": "monitor", "input-gaming": "gamepad-2", "input-gaming-symbolic": "gamepad-2",
  "camera-web": "video", "weather-clear": "sun", "weather-clear-night": "moon", "update-none": "refresh-cw", "update-low": "refresh-cw",
 },
 "devices": {
  "audio-input-microphone": "mic", "audio-headphones": "headphones", "audio-card": "volume-2", "camera-web": "video", "camera-photo": "camera",
  "computer": "monitor", "computer-laptop": "laptop", "drive-harddisk": "hard-drive", "drive-removable-media": "usb", "drive-optical": "disc-3",
  "input-keyboard": "keyboard", "input-mouse": "mouse", "input-gaming": "gamepad-2", "network-wireless": "wifi", "network-wired": "cable",
  "printer": "printer", "video-display": "monitor", "phone": "smartphone", "smartphone": "smartphone", "battery": "battery-medium", "cpu": "cpu",
 },
 "places": {
  "folder": "folder", "folder-open": "folder-open", "folder-documents": "file-text", "folder-download": "download", "folder-downloads": "download",
  "folder-music": "music", "folder-pictures": "image", "folder-videos": "film", "folder-games": "gamepad-2", "folder-code": "code",
  "user-home": "house", "user-desktop": "monitor", "user-trash": "trash", "network-workgroup": "globe", "folder-network": "globe",
  "folder-remote": "cloud", "start-here": "layout-grid", "start-here-kde": "layout-grid",
 },
 "categories": {
  "applications-all": "layout-grid", "applications-games": "gamepad-2", "applications-internet": "globe", "applications-multimedia": "music",
  "applications-office": "file-text", "applications-development": "code", "applications-system": "cpu", "applications-utilities": "wrench",
  "applications-graphics": "image", "preferences-system": "settings-2", "preferences-desktop": "monitor", "preferences-other": "sliders-horizontal",
  "applications-education": "book-open", "applications-science": "flask-conical", "applications-accessories": "wrench", "system-help": "info",
 },
}

HEAD = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
# pictogrammes maison (absents de Lucide)
EXTRA = {
    "zzz": HEAD + '<path d="M4 8h5l-5 6h5" /><path d="M13 4h4l-4 5h4" /><path d="M14 14h6l-6 6h6" /></svg>',
    "circle-help": HEAD + '<circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>',
}

def lucide(name):
    if name in EXTRA:
        s = EXTRA[name]
    else:
        p = os.path.join(SRC, name + ".svg")
        if not os.path.exists(p):
            raise SystemExit("icone Lucide absente : " + name)
        s = open(p).read()
    s = re.sub(r"\s+", " ", s)
    s = s.replace('stroke="currentColor"', 'stroke="%s"' % COLOR).replace('stroke-width="2"', 'stroke-width="%s"' % WIDTH)
    return s

dirs = []
for ctx, names in MAP.items():
    d = os.path.join(OUT, "scalable", ctx)
    os.makedirs(d, exist_ok=True)
    dirs.append("scalable/" + ctx)
    for fd_name, lu in names.items():
        svg = lucide(lu)
        open(os.path.join(d, fd_name + ".svg"), "w").write(svg)
        # variante -symbolic (zone systeme, Plasma)
        open(os.path.join(d, fd_name + "-symbolic.svg"), "w").write(svg)

idx = ["[Icon Theme]", "Name=Nox", "Comment=Pictogrammes Nox OS (base Lucide, ISC)", "Inherits=breeze-dark,hicolor",
       "Directories=" + ",".join(dirs), ""]
for d in dirs:
    idx += ["[%s]" % d, "Size=48", "MinSize=8", "MaxSize=512", "Type=Scalable", "Context=" + d.split("/")[1].capitalize(), ""]
open(os.path.join(OUT, "index.theme"), "w").write("\n".join(idx))
open(os.path.join(OUT, "LICENSE"), "w").write(
    "Pictogrammes derives de Lucide (https://lucide.dev)\nISC License\n\nCopyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). "
    "All other copyright (c) for Lucide are held by Lucide Contributors 2022.\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, "
    "provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE "
    "INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.\n")
print("ok", sum(len(v) for v in MAP.values()), "icones")
