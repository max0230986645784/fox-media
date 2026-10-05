#!/usr/bin/python3
"""Premier demarrage de Nox OS : choix du code de session (plein ecran, style Nox)."""
import os, subprocess, sys
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib

FLAG = "/var/lib/nox/firstboot-done"
WALL = "/usr/share/nox/wallpapers/nox.jpg"
LOGO = "/usr/share/nox/logo.png"
USER = os.environ.get("NOX_USER", "nox")

CSS = b"""
window { background-color: #07080c; }
.card { background-color: rgba(20,22,30,0.82); border-radius: 22px; padding: 42px; }
.title { color: #ffffff; font-size: 30px; font-weight: 600; }
.sub   { color: rgba(255,255,255,0.75); font-size: 16px; }
.err   { color: #ff8a80; font-size: 15px; }
entry  { background: rgba(255,255,255,0.10); color: #fff; border: 1px solid rgba(255,255,255,0.35);
         border-radius: 10px; font-size: 20px; padding: 10px; min-width: 320px; }
entry:focus { border-color: #8fa8ff; }
button.suggested-action { background: #6c7cff; color: #fff; border-radius: 10px; padding: 10px 28px; font-size: 16px; }
"""

class Setup(Gtk.Window):
    def __init__(self):
        super().__init__(title="Bienvenue sur Nox OS")
        self.fullscreen()
        self.set_decorated(False)
        self.first = None
        prov = Gtk.CssProvider(); prov.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), prov,
                                                 Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        overlay = Gtk.Overlay(); self.add(overlay)
        if os.path.exists(WALL):
            bg = Gtk.Image.new_from_file(WALL)
            overlay.add(bg)
        card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        card.get_style_context().add_class("card")
        card.set_halign(Gtk.Align.CENTER); card.set_valign(Gtk.Align.CENTER)
        if os.path.exists(LOGO):
            from gi.repository import GdkPixbuf
            pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(LOGO, 120, 120, True)
            card.pack_start(Gtk.Image.new_from_pixbuf(pb), False, False, 0)
        self.title_l = Gtk.Label(label="Bienvenue sur Nox OS"); self.title_l.get_style_context().add_class("title")
        self.sub_l = Gtk.Label(label="Choisissez un code pour proteger votre session"); self.sub_l.get_style_context().add_class("sub")
        self.entry = Gtk.Entry(); self.entry.set_visibility(False); self.entry.set_invisible_char("\u2022")
        self.entry.set_alignment(0.5); self.entry.connect("activate", self.on_ok)
        self.err_l = Gtk.Label(label=""); self.err_l.get_style_context().add_class("err")
        ok = Gtk.Button(label="Continuer"); ok.get_style_context().add_class("suggested-action"); ok.connect("clicked", self.on_ok)
        for w in (self.title_l, self.sub_l, self.entry, self.err_l, ok):
            card.pack_start(w, False, False, 0)
        overlay.add_overlay(card)
        self.show_all(); self.entry.grab_focus()

    def on_ok(self, *_):
        code = self.entry.get_text()
        self.entry.set_text("")
        if self.first is None:
            if len(code) < 4:
                self.err_l.set_text("Le code doit contenir au moins 4 caracteres."); return
            self.first = code; self.err_l.set_text("")
            self.sub_l.set_text("Confirmez votre code")
            return
        if code != self.first:
            self.first = None; self.err_l.set_text("Les deux codes ne correspondent pas.")
            self.sub_l.set_text("Choisissez un code pour proteger votre session"); return
        subprocess.run(["sudo", "/usr/bin/chpasswd"], input=f"{USER}:{code}\n", text=True, check=False)
        subprocess.run(["sudo", "/usr/lib/nox/nox-firstboot-done"], check=False)
        Gtk.main_quit()

if __name__ == "__main__":
    if os.path.exists(FLAG):
        sys.exit(0)
    Setup(); Gtk.main()
