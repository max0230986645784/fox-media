; =============================================================================
;  NoxOS - Bootloader stage 2
; -----------------------------------------------------------------------------
;  Charge a 0x7E00 par le stage 1, toujours en mode reel 16 bits.
;  Travail du stage 2 :
;    1. recuperer la carte memoire physique via BIOS E820 -> boot info (0x9000)
;    2. charger le kernel (LBA 1+STAGE2_SECTORS, KERNEL_SECTORS secteurs)
;       a l'adresse physique 0x10000 via INT 13h etendu (AH=42h)
;    3. activer la ligne A20
;    4. charger une GDT plate et passer en mode protege 32 bits
;    5. sauter dans le kernel avec :  EAX = NOX_BOOT_MAGIC, EBX = &boot_info
;
;  Layout de boot_info (a 0x9000), lu par kernel/memory.c :
;    u32 e820_count
;    u32 boot_drive
;    u32 kernel_sectors
;    u32 reserved
;    e820_entry entries[]   (24 octets chacune, a partir de 0x9010)
; =============================================================================

%ifndef STAGE2_SECTORS
%define STAGE2_SECTORS 4
%endif
%ifndef KERNEL_SECTORS
%define KERNEL_SECTORS 64
%endif

[BITS 16]
[ORG 0x7E00]

KERNEL_LBA        equ 1 + STAGE2_SECTORS
KERNEL_LOAD_SEG   equ 0x1000              ; 0x1000:0x0000 = 0x10000 physique
KERNEL_ENTRY      equ 0x10000
BOOT_INFO         equ 0x9000
E820_ENTRIES      equ BOOT_INFO + 16
NOX_BOOT_MAGIC    equ 0x4E4F5831          ; "NOX1"
SECTORS_PER_READ  equ 32                  ; 16 Ko par appel BIOS

stage2_start:
    mov [boot_drive], dl

    mov si, msg_stage2
    call print

    ; ------------------------------------------------------------------
    ; 1. Carte memoire E820
    ; ------------------------------------------------------------------
    call detect_memory
    jc .no_memmap
    jmp .memmap_done
.no_memmap:
    mov si, msg_e820_fail
    call print
    mov dword [BOOT_INFO], 0
.memmap_done:

    ; ------------------------------------------------------------------
    ; 2. Chargement du kernel
    ; ------------------------------------------------------------------
    mov si, msg_loading
    call print
    call load_kernel
    jc disk_error

    ; ------------------------------------------------------------------
    ; 3. Ligne A20 (permet d'adresser au-dela de 1 Mo)
    ; ------------------------------------------------------------------
    in al, 0x92
    or al, 0x02
    and al, 0xFE                ; ne surtout pas ecrire le bit 0 (reset)
    out 0x92, al

    ; ------------------------------------------------------------------
    ; 4. Mode protege
    ; ------------------------------------------------------------------
    mov si, msg_pmode
    call print

    cli
    lgdt [gdt_descriptor]
    mov eax, cr0
    or eax, 1                   ; CR0.PE = 1
    mov cr0, eax
    jmp CODE_SEG:pm_entry       ; far jump : vide le pipeline, charge CS

; -----------------------------------------------------------------------------
; detect_memory : BIOS INT 15h / EAX=E820h
;   Ecrit les entrees a E820_ENTRIES et le compteur a [BOOT_INFO].
;   CF=1 si le BIOS ne supporte pas E820.
; -----------------------------------------------------------------------------
detect_memory:
    push es
    xor ax, ax
    mov es, ax
    mov di, E820_ENTRIES
    xor ebx, ebx                ; continuation = 0 au premier appel
    xor bp, bp                  ; compteur d'entrees
.loop:
    mov eax, 0xE820
    mov edx, 0x534D4150         ; 'SMAP'
    mov ecx, 24
    mov dword [es:di + 20], 1   ; ACPI 3.0 : entree valide par defaut
    int 0x15
    jc .check_end               ; CF apres le 1er appel = fin de liste
    cmp eax, 0x534D4150
    jne .fail
    test ecx, ecx
    jz .skip                    ; entree vide
    cmp dword [es:di + 8], 0    ; longueur basse = 0 ?
    jne .keep
    cmp dword [es:di + 12], 0   ; et longueur haute = 0 -> on ignore
    je .skip
.keep:
    inc bp
    add di, 24
    cmp bp, 32                  ; maximum 32 entrees dans notre buffer
    jae .done
.skip:
    test ebx, ebx
    jz .done
    jmp .loop
.check_end:
    test bp, bp
    jz .fail
.done:
    mov [BOOT_INFO], bp
    mov word [BOOT_INFO + 2], 0
    mov al, [boot_drive]
    movzx eax, al
    mov [BOOT_INFO + 4], eax
    mov dword [BOOT_INFO + 8], KERNEL_SECTORS
    mov dword [BOOT_INFO + 12], 0
    pop es
    clc
    ret
.fail:
    pop es
    stc
    ret

; -----------------------------------------------------------------------------
; load_kernel : lit KERNEL_SECTORS secteurs a partir de KERNEL_LBA vers
;   KERNEL_LOAD_SEG:0000, par blocs de SECTORS_PER_READ via INT 13h AH=42h.
;   CF=1 en cas d'erreur.
; -----------------------------------------------------------------------------
load_kernel:
    mov word [dap_segment], KERNEL_LOAD_SEG
    mov dword [dap_lba], KERNEL_LBA
    mov cx, KERNEL_SECTORS
.loop:
    test cx, cx
    jz .ok
    mov ax, cx
    cmp ax, SECTORS_PER_READ
    jbe .count_ok
    mov ax, SECTORS_PER_READ
.count_ok:
    mov [dap_count], ax
    push cx
    push ax
    mov ah, 0x42
    mov dl, [boot_drive]
    mov si, dap
    int 0x13
    pop ax
    pop cx
    jc .fail
    sub cx, ax                      ; secteurs restants
    movzx eax, ax
    add dword [dap_lba], eax        ; LBA suivant
    shl ax, 5                       ; secteurs * 512 / 16 = paragraphes
    add [dap_segment], ax           ; segment de destination suivant
    mov al, '.'
    mov ah, 0x0E
    mov bh, 0
    int 0x10
    jmp .loop
.ok:
    mov si, msg_crlf
    call print
    clc
    ret
.fail:
    stc
    ret

disk_error:
    mov si, msg_disk_error
    call print
.hang:
    hlt
    jmp .hang

print:
    pusha
    mov ah, 0x0E
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

; --- Disk Address Packet pour INT 13h AH=42h --------------------------------
align 4
dap:
    db 0x10                     ; taille du paquet
    db 0
dap_count:  dw 0                ; nombre de secteurs
dap_offset: dw 0                ; offset du buffer
dap_segment:dw 0                ; segment du buffer
dap_lba:    dq 0                ; LBA de depart

; --- GDT plate (code + data, base 0, limite 4 Go) ----------------------------
align 8
gdt_start:
    dq 0                        ; descripteur nul obligatoire
gdt_code:                       ; 0x08
    dw 0xFFFF                   ; limite 0..15
    dw 0x0000                   ; base 0..15
    db 0x00                     ; base 16..23
    db 10011010b                ; present, ring 0, code, lisible
    db 11001111b                ; granularite 4K, 32 bits, limite 16..19
    db 0x00                     ; base 24..31
gdt_data:                       ; 0x10
    dw 0xFFFF
    dw 0x0000
    db 0x00
    db 10010010b                ; present, ring 0, data, ecriture
    db 11001111b
    db 0x00
gdt_end:

gdt_descriptor:
    dw gdt_end - gdt_start - 1
    dd gdt_start

CODE_SEG equ gdt_code - gdt_start
DATA_SEG equ gdt_data - gdt_start

boot_drive      db 0
msg_stage2      db "NoxOS boot stage 2", 13, 10, 0
msg_loading     db "Loading kernel", 0
msg_pmode       db "Entering protected mode...", 13, 10, 0
msg_e820_fail   db "WARN: E820 memory map unavailable", 13, 10, 0
msg_disk_error  db "ERR: kernel read failed", 13, 10, 0
msg_crlf        db 13, 10, 0

; =============================================================================
;  Mode protege 32 bits
; =============================================================================
[BITS 32]
pm_entry:
    mov ax, DATA_SEG
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax
    mov esp, 0x90000            ; pile temporaire, le kernel installe la sienne

    mov eax, NOX_BOOT_MAGIC
    mov ebx, BOOT_INFO
    jmp KERNEL_ENTRY

    times (STAGE2_SECTORS * 512) - ($ - $$) db 0
