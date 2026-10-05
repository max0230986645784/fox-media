#!/bin/bash
# Nox OS (base Linux/Debian) : configure le rootfs et construit une ISO hybride BIOS+UEFI.
# Usage : sudo ./build.sh <rootfs> <sortie.iso>   (rootfs cree par debootstrap bookworm)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
R=${1:?rootfs}; ISO=${2:?iso}
W=$(mktemp -d /var/tmp/noxiso.XXXX)

echo "== assets Nox"
install -d $R/usr/share/nox/wallpapers $R/usr/share/sounds/nox $R/usr/lib/nox \
           $R/usr/share/plymouth/themes/nox $R/usr/share/sddm/themes/nox $R/var/lib/nox
cp $HERE/assets/logo.png $R/usr/share/nox/
cp $HERE/assets/wallpapers/* $R/usr/share/nox/wallpapers/
cp $HERE/assets/sounds/* $R/usr/share/sounds/nox/
cp $HERE/plymouth/nox/* $R/usr/share/plymouth/themes/nox/
cp $HERE/sddm/nox/* $R/usr/share/sddm/themes/nox/
cp $HERE/scripts/nox-firstboot.py $HERE/scripts/nox-firstboot-done $HERE/scripts/nox-session-start  $R/usr/lib/nox/
cp $HERE/scripts/nox-sound $HERE/apps/nox-centre $HERE/apps/nox-gamemode $R/usr/bin/
cp $HERE/applications/*.desktop $R/usr/share/applications/
mkdir -p $R/usr/share/icons && rm -rf $R/usr/share/icons/nox && cp -r $HERE/icons/nox $R/usr/share/icons/
cp -r $HERE/etc/sddm.conf.d $R/etc/
install -m 440 $HERE/etc/sudoers.d/nox-firstboot $R/etc/sudoers.d/
cp -r $HERE/skel/. $R/etc/skel/
mkdir -p $R/usr/share/plasma/look-and-feel && cp -r $HERE/lookandfeel/org.nox.desktop $R/usr/share/plasma/look-and-feel/
cp $HERE/scripts/nox-desktop-apply $R/usr/lib/nox/
mkdir -p $R/usr/share/plasma/plasmoids && cp -r $HERE/plasmoids/. $R/usr/share/plasma/plasmoids/
rm -rf $R/usr/share/plasma/plasmoids/org.kde.plasma.kickerdash/contents/ui && cp -r $HERE/plasmoids/org.kde.plasma.kicker/contents/ui $R/usr/share/plasma/plasmoids/org.kde.plasma.kickerdash/contents/ui
install -m 644 $HERE/etc/X11/Xsession.d/40nox-session $R/etc/X11/Xsession.d/
cp $HERE/apps/nox $R/usr/bin/ && chmod 755 $R/usr/bin/nox
python3 - $R/usr/share/plasma/wallpapers/org.kde.image/contents/config/main.xml <<'PYX'
import sys, re
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'(<entry name="Image" type="String">\s*<label>[^<]*</label>\s*<default>)[^<]*(</default>)', r'\g<1>/usr/share/nox/wallpapers/nox.jpg\2', s, count=1)
open(p, "w").write(s)
PYX
rm -f $R/var/lib/nox/firstboot-done

echo "== identite"
cat > $R/etc/os-release <<'EOR'
PRETTY_NAME="Nox OS (Nox Aurora)"
NAME="Nox OS"
VERSION_ID="aurora"
VERSION="Nox Aurora"
ID=noxos
ID_LIKE=debian
HOME_URL="https://github.com/max0230986645784/fox-media"
LOGO=nox
EOR
echo noxos > $R/etc/hostname
printf '127.0.0.1\tlocalhost\n127.0.1.1\tnoxos\n' > $R/etc/hosts
echo "Nox OS" > $R/etc/issue
printf "Nox OS\nEdition   : Nox Aurora (prototype Linux)\nVersion   : 0.4\n" > $R/etc/nox-release

chroot $R /bin/bash -e <<'EOC'
export DEBIAN_FRONTEND=noninteractive
# utilisateur nox (code choisi au premier demarrage ; mot de passe provisoire = nox)
id nox >/dev/null 2>&1 || useradd -m -s /bin/bash -G sudo,audio,video,netdev,plugdev,input nox
echo "nox:nox" | chpasswd
cp -rT /etc/skel /home/nox && chown -R nox:nox /home/nox
# sddm
systemctl enable sddm NetworkManager
systemctl set-default graphical.target
# plymouth
plymouth-set-default-theme nox
echo 'FRAMEBUFFER=y' > /etc/initramfs-tools/conf.d/splash
update-initramfs -u -k all
# locale fr
sed -i 's/^# *fr_FR.UTF-8/fr_FR.UTF-8/' /etc/locale.gen; locale-gen >/dev/null || true
echo 'LANG=fr_FR.UTF-8' > /etc/default/locale; echo 'LANG=fr_FR.UTF-8' >> /etc/environment
ln -sf /usr/share/zoneinfo/Europe/Paris /etc/localtime; echo Europe/Paris > /etc/timezone
rm -rf /etc/xdg/autostart/org.kde.*ksplash* 2>/dev/null; true
echo 'KEYMAP=fr' > /etc/vconsole.conf
printf 'XKBMODEL="pc105"\nXKBLAYOUT="fr"\nXKBVARIANT=""\nXKBOPTIONS=""\n' > /etc/default/keyboard
apt-get install -y -qq librsvg2-common >/dev/null 2>&1 || true
gtk-update-icon-cache -f -q /usr/share/icons/nox 2>/dev/null || true
update-desktop-database -q 2>/dev/null || true
apt-get clean
EOC
# live-config ne doit pas recreer un autre utilisateur
mkdir -p $R/etc/live/config.conf.d
cat > $R/etc/live/config.conf.d/nox.conf <<'EOL'
LIVE_HOSTNAME="noxos"
LIVE_USERNAME="nox"
LIVE_USER_FULLNAME="Nox"
LIVE_CONFIG_NOCOMPONENTS="user-setup,sudo,locales,keyboard-configuration,xserver-xorg,login"
EOL

echo "== squashfs"
mkdir -p $W/live $W/boot/grub $W/EFI/boot
if [ -n "${NOX_SQUASHFS:-}" ]; then cp "$NOX_SQUASHFS" $W/live/filesystem.squashfs; else
if [ -n "${NOX_FAST:-}" ]; then COMP="-comp zstd -Xcompression-level 3"; else COMP="-comp xz -b 1M"; fi
mksquashfs $R $W/live/filesystem.squashfs $COMP -noappend -wildcards \
    -e 'proc/*' 'sys/*' 'dev/*' 'run/*' 'tmp/*' 'var/cache/apt/archives/*.deb' >/dev/null
fi
cp $R/boot/vmlinuz-* $W/live/vmlinuz
cp $R/boot/initrd.img-* $W/live/initrd.img

echo "== grub (menu Nox)"
cat > $W/boot/grub/embed.cfg <<'EOG'
search --no-floppy --set=root --label NOXOS
set prefix=($root)/boot/grub
configfile ($root)/boot/grub/grub.cfg
EOG
cp $HERE/assets/wallpapers/nox.jpg $W/boot/grub/background.jpg 2>/dev/null || true
cp $HERE/assets/logo.png $W/boot/grub/logo.png
cat > $W/boot/grub/grub.cfg <<'EOG'
set timeout=4
set default=0
insmod all_video
insmod gfxterm
insmod png
insmod jpeg
set gfxmode=auto
terminal_output gfxterm
background_image /boot/grub/background.jpg
set color_normal=white/black
set color_highlight=black/white

menuentry "Nox OS" {
    linux /live/vmlinuz boot=live components quiet splash loglevel=3 rd.udev.log_level=3 vt.global_cursor_default=0
    initrd /live/initrd.img
}
menuentry "Nox OS (mode sans echec)" {
    linux /live/vmlinuz boot=live components nomodeset
    initrd /live/initrd.img
}
menuentry "Nox OS (mode texte / depannage)" {
    linux /live/vmlinuz boot=live components systemd.unit=multi-user.target
    initrd /live/initrd.img
}
if [ "$grub_platform" = "efi" ]; then
    menuentry "Reglages du BIOS / UEFI" { fwsetup }
fi
menuentry "Redemarrer" { reboot }
menuentry "Eteindre" { halt }
EOG

# UEFI : image bootx64.efi + efiboot.img
grub-mkstandalone -O x86_64-efi -o $W/EFI/boot/bootx64.efi \
    --modules="part_gpt part_msdos fat iso9660 normal linux search search_label configfile all_video gfxterm png jpeg echo test loadenv halt reboot efi_gop efi_uga" \
    --locales="" --fonts="" "boot/grub/grub.cfg=$W/boot/grub/embed.cfg"
dd if=/dev/zero of=$W/boot/grub/efiboot.img bs=1M count=8 status=none
mkfs.vfat -n NOXEFI $W/boot/grub/efiboot.img >/dev/null
mmd -i $W/boot/grub/efiboot.img ::/EFI ::/EFI/boot
mcopy -i $W/boot/grub/efiboot.img $W/EFI/boot/bootx64.efi ::/EFI/boot/
# BIOS : core.img + cdboot
grub-mkstandalone -O i386-pc -o $W/boot/grub/core.img \
    --modules="biosdisk iso9660 part_msdos part_gpt normal linux search configfile all_video gfxterm png jpeg vbe vga video_bochs video_cirrus echo test halt reboot" \
    --locales="" --fonts="" --install-modules="linux normal iso9660 biosdisk search configfile all_video gfxterm png jpeg vbe vga video_bochs video_cirrus echo test halt reboot" \
    "boot/grub/grub.cfg=$W/boot/grub/embed.cfg"
cat /usr/lib/grub/i386-pc/cdboot.img $W/boot/grub/core.img > $W/boot/grub/bios.img

xorriso -as mkisofs -iso-level 3 -full-iso9660-filenames -volid "NOXOS" \
    -eltorito-boot boot/grub/bios.img -no-emul-boot -boot-load-size 4 -boot-info-table \
    --eltorito-catalog boot/grub/boot.cat --grub2-boot-info \
    --grub2-mbr /usr/lib/grub/i386-pc/boot_hybrid.img \
    -eltorito-alt-boot -e boot/grub/efiboot.img -no-emul-boot -isohybrid-gpt-basdat \
    -append_partition 2 0xef $W/boot/grub/efiboot.img \
    -o "$ISO" "$W" 2>&1 | tail -2
rm -rf $W
ls -lh "$ISO"
