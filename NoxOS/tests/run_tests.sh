#!/usr/bin/env bash
# =============================================================================
#  NoxOS - tests automatiques
# -----------------------------------------------------------------------------
#  Demarre l'image dans QEMU sans fenetre et verifie :
#    - que le kernel boote et affiche "System initialized successfully."
#    - que le clavier PS/2 fonctionne (touches envoyees via le moniteur QEMU)
#    - que le shell repond a des commandes envoyees par le port serie
#    - v0.2 : PMM, pagination, tas (heaptest), threads preemptifs (spawn/ps)
#  Toute la sortie du kernel (VGA = serie) est enregistree dans
#  build/test-serial.log puis analysee.
#
#  Usage : make test   (ou ./tests/run_tests.sh apres `make`)
# =============================================================================
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="$ROOT/build/noxos.img"
LOG="$ROOT/build/test-serial.log"
QEMU="${QEMU:-qemu-system-i386}"
PORT="${NOX_TEST_PORT:-4555}"

if [ ! -f "$IMAGE" ]; then
    echo "image not found: $IMAGE (run make first)"
    exit 1
fi
rm -f "$LOG"

serial_send() {
    # Ecrit une ligne sur le port serie du kernel via le socket TCP de QEMU
    # (connexion ouverte une seule fois sur le descripteur 3).
    printf '%s\r' "$1" >&3
    sleep 0.7
}

# Le script ci-dessous alimente le moniteur QEMU (stdin) et, en parallele,
# le port serie.
(
    sleep 3                                     # temps de boot
    for k in v e r s i o n ret; do              # clavier PS/2 virtuel
        echo "sendkey $k"
        sleep 0.15
    done
    sleep 1
    exec 3<>"/dev/tcp/127.0.0.1/$PORT"
    serial_send "help"
    serial_send "echo serial ok"
    serial_send "memory"
    serial_send "heaptest"
    serial_send "spawn 3"
    sleep 3                                     # les threads demo tournent
    serial_send "ps"
    exec 3>&-
    echo "quit"
) | timeout 40 "$QEMU" \
    -drive file="$IMAGE",format=raw,if=ide -m 64M -no-reboot \
    -display none -monitor stdio \
    -chardev socket,id=ser0,host=127.0.0.1,port="$PORT",server=on,wait=off,logfile="$LOG" \
    -serial chardev:ser0 >/dev/null 2>&1

fail=0
check() {
    if grep -qF -- "$1" "$LOG" 2>/dev/null; then
        echo "  [PASS] $2"
    else
        echo "  [FAIL] $2  (expected: '$1')"
        fail=1
    fi
}

echo "NoxOS v0.2 boot tests"
check "NOXOS KERNEL v"                     "kernel banner printed"
check "System initialized successfully."   "kernel init completed"
check "E820 entries:"                      "memory map received from bootloader"
check "nox> version"                       "PS/2 keyboard input reaches the shell"
check "NoxOS 0.2.0 - Built from scratch."  "'version' command works"
check "list available commands"            "'help' via serial works"
check "serial ok"                          "'echo' via serial works"
check "Total usable :"                     "'memory' command works"
check "[init] paging"                      "paging enabled at boot"
check "Frames (4 KB):"                     "physical frame allocator reports stats"
check "heap test ok"                       "kmalloc/kfree/aligned + integrity check"
check "spawned thread 5 'demo-02'"         "3 kernel threads created"
check "[demo-00] step 1/3"                 "thread demo-00 ran (preempted shell)"
check "[demo-02] finished"                 "threads sleep/wake and exit"
check "2 threads:"                         "finished threads were reaped (ps)"
check "main"                               "'ps' lists the main thread"

if grep -q "KERNEL PANIC" "$LOG" 2>/dev/null; then
    echo "  [FAIL] kernel panic detected"
    fail=1
fi

if [ $fail -eq 0 ]; then
    echo "ALL TESTS PASSED"
else
    echo "SOME TESTS FAILED - see $LOG"
fi
exit $fail
