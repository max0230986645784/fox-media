; =============================================================================
;  NoxOS - stubs d'interruption
; -----------------------------------------------------------------------------
;  Le CPU saute ici quand une interruption survient. Chaque stub :
;    - pousse un code d'erreur factice si le CPU n'en fournit pas,
;    - pousse le numero d'interruption,
;    - sauvegarde les registres et appelle le dispatcher C (isr_dispatch),
;    - restaure tout et revient avec iret.
;  Le resultat est une `struct registers` (voir include/nox/idt.h) sur la pile.
; =============================================================================
[BITS 32]
section .text

extern isr_dispatch

; Exceptions CPU (0..31). Celles marquees ERR poussent deja un code d'erreur.
%macro ISR_NOERR 1
global isr%1
isr%1:
    push dword 0
    push dword %1
    jmp isr_common
%endmacro

%macro ISR_ERR 1
global isr%1
isr%1:
    push dword %1
    jmp isr_common
%endmacro

; IRQ materielles (32..47)
%macro IRQ 2
global irq%1
irq%1:
    push dword 0
    push dword %2
    jmp isr_common
%endmacro

ISR_NOERR 0     ; Division par zero
ISR_NOERR 1     ; Debug
ISR_NOERR 2     ; NMI
ISR_NOERR 3     ; Breakpoint
ISR_NOERR 4     ; Overflow
ISR_NOERR 5     ; Bound range
ISR_NOERR 6     ; Opcode invalide
ISR_NOERR 7     ; Device not available
ISR_ERR   8     ; Double fault
ISR_NOERR 9     ; Coprocessor segment overrun
ISR_ERR   10    ; TSS invalide
ISR_ERR   11    ; Segment absent
ISR_ERR   12    ; Stack fault
ISR_ERR   13    ; General protection fault
ISR_ERR   14    ; Page fault
ISR_NOERR 15    ; Reserve
ISR_NOERR 16    ; x87 FPU
ISR_ERR   17    ; Alignment check
ISR_NOERR 18    ; Machine check
ISR_NOERR 19    ; SIMD FP
ISR_NOERR 20    ; Virtualisation
ISR_ERR   21    ; Control protection
ISR_NOERR 22
ISR_NOERR 23
ISR_NOERR 24
ISR_NOERR 25
ISR_NOERR 26
ISR_NOERR 27
ISR_NOERR 28
ISR_NOERR 29
ISR_ERR   30    ; Security exception
ISR_NOERR 31

IRQ 0, 32       ; PIT timer
IRQ 1, 33       ; clavier PS/2
IRQ 2, 34
IRQ 3, 35
IRQ 4, 36
IRQ 5, 37
IRQ 6, 38
IRQ 7, 39
IRQ 8, 40
IRQ 9, 41
IRQ 10, 42
IRQ 11, 43
IRQ 12, 44      ; souris PS/2
IRQ 13, 45
IRQ 14, 46      ; ATA primaire
IRQ 15, 47      ; ATA secondaire

ISR_NOERR 128   ; int 0x80 : appel systeme (porte DPL 3)

isr_common:
    pusha                       ; eax ecx edx ebx esp ebp esi edi
    mov ax, ds
    push eax                    ; sauvegarde du segment de donnees

    mov ax, 0x10                ; segments kernel
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax

    push esp                    ; struct registers* en argument
    call isr_dispatch
    add esp, 4

    pop eax
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax

    popa
    add esp, 8                  ; retire int_no et err_code
    iret
