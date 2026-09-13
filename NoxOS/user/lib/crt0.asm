; NoxOS userland - point d'entree des programmes
; Premier octet du binaire : le kernel saute ici en ring 3 avec une pile
; vide. On appelle main() puis exit(code).
[BITS 32]
section .text.start

extern main
extern exit

global _start
_start:
    xor ebp, ebp
    call main
    push eax
    call exit
.hang:
    jmp .hang
