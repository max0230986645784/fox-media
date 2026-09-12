; =============================================================================
;  NoxOS kernel - point d'entree
; -----------------------------------------------------------------------------
;  Le bootloader saute ici (0x10000) en mode protege 32 bits avec :
;    EAX = NOX_BOOT_MAGIC ("NOX1"), EBX = adresse physique de boot_info.
;  On installe la pile du kernel et on appelle kmain(magic, boot_info).
;  Ce fichier DOIT etre le premier objet lie (voir kernel/linker.ld).
; =============================================================================

[BITS 32]

section .text.entry
global _start
extern kmain
extern _bss_start
extern _bss_end

_start:
    cli
    mov esp, kernel_stack_top
    xor ebp, ebp

    ; Le bootloader ne charge que les octets presents dans le binaire :
    ; la section .bss (variables globales non initialisees) doit etre mise
    ; a zero par nous-memes.
    ; (la pile est elle-meme dans .bss : on garde EAX/EBX dans des registres)
    mov esi, eax
    mov edx, ebx
    mov edi, _bss_start
    mov ecx, _bss_end
    sub ecx, edi
    xor eax, eax
    rep stosb
    mov eax, esi
    mov ebx, edx

    push ebx                    ; arg 2 : boot_info*
    push eax                    ; arg 1 : magic
    call kmain

.halt:                          ; kmain ne doit jamais revenir
    cli
    hlt
    jmp .halt

section .bss
align 16
kernel_stack_bottom:
    resb 16384                  ; 16 Ko de pile kernel
kernel_stack_top:
