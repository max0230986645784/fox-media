; NoxOS - chargement de la GDT et rechargement des registres de segment
[BITS 32]
section .text

global gdt_flush
gdt_flush:
    mov eax, [esp + 4]
    lgdt [eax]
    mov ax, 0x10                ; kernel data
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax
    jmp 0x08:.reload_cs         ; far jump pour recharger CS
.reload_cs:
    ret
