; =============================================================================
;  NoxOS - Bootloader stage 1 (MBR, 512 bytes)
; -----------------------------------------------------------------------------
;  Le BIOS charge ce secteur a l'adresse 0x7C00 et saute dessus en mode reel
;  16 bits. Il n'a qu'un seul travail : charger le stage 2 (secteurs 2..N)
;  juste derriere lui en memoire (0x7E00) et lui donner la main.
;
;  Carte memoire basse utilisee par NoxOS au boot :
;    0x7C00 - 0x7DFF   stage 1 (ce fichier)
;    0x7E00 - 0x8DFF   stage 2 (STAGE2_SECTORS * 512 octets)
;    0x9000 - 0x9FFF   boot info (carte memoire E820) remplie par le stage 2
;    0x10000 - ...     kernel NoxOS (charge par le stage 2)
; =============================================================================

%ifndef STAGE2_SECTORS
%define STAGE2_SECTORS 4
%endif

[BITS 16]
[ORG 0x7C00]

STAGE2_LOAD_ADDR equ 0x7E00

start:
    cli
    xor ax, ax
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7C00              ; pile temporaire juste sous le stage 1
    sti

    mov [boot_drive], dl        ; le BIOS donne le disque de boot dans DL

    mov si, msg_boot
    call print

    ; --- Remise a zero du controleur disque -------------------------------
    xor ah, ah
    mov dl, [boot_drive]
    int 0x13
    jc disk_error

    ; --- Lecture du stage 2 (CHS : cylindre 0, tete 0, secteur 2) ----------
    mov ah, 0x02                ; fonction BIOS "read sectors"
    mov al, STAGE2_SECTORS      ; nombre de secteurs
    mov ch, 0                   ; cylindre 0
    mov cl, 2                   ; secteur 2 (les secteurs commencent a 1)
    mov dh, 0                   ; tete 0
    mov dl, [boot_drive]
    mov bx, STAGE2_LOAD_ADDR    ; ES:BX = 0x0000:0x7E00
    int 0x13
    jc disk_error
    cmp al, STAGE2_SECTORS
    jne disk_error

    ; --- Saut vers le stage 2 ---------------------------------------------
    mov dl, [boot_drive]        ; on transmet le disque de boot au stage 2
    jmp 0x0000:STAGE2_LOAD_ADDR

disk_error:
    mov si, msg_disk_error
    call print
.hang:
    hlt
    jmp .hang

; -----------------------------------------------------------------------------
; print : affiche la chaine terminee par 0 pointee par DS:SI via le BIOS
; -----------------------------------------------------------------------------
print:
    pusha
    mov ah, 0x0E                ; teletype output
    mov bh, 0
.loop:
    lodsb
    test al, al
    jz .done
    int 0x10
    jmp .loop
.done:
    popa
    ret

boot_drive      db 0
msg_boot        db "NoxOS boot stage 1", 13, 10, 0
msg_disk_error  db "ERR: disk read failed", 13, 10, 0

    times 510 - ($ - $$) db 0   ; remplissage jusqu'a 510 octets
    dw 0xAA55                   ; signature de boot obligatoire
