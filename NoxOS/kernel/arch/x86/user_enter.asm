; =============================================================================
;  NoxOS - passage en ring 3
; -----------------------------------------------------------------------------
;  void enter_user_mode(u32 eip, u32 esp)   -- ne revient jamais
;
;  On fabrique sur la pile kernel la trame qu'un `iret` attend pour revenir
;  vers un niveau moins privilegie : ss, esp, eflags, cs, eip. Le CPU charge
;  alors CS=USER_CS (RPL 3) et saute a `eip` avec la pile utilisateur `esp`.
;  IF est force a 1 dans eflags : le programme sera preempte par le timer.
;  Le retour vers le kernel ne se fait ensuite que par int 0x80 ou par une
;  exception, sur la pile kernel indiquee par le TSS (esp0).
; =============================================================================
[BITS 32]
section .text

USER_CS equ 0x18 | 3
USER_DS equ 0x20 | 3

global enter_user_mode
enter_user_mode:
    cli
    mov ecx, [esp + 4]          ; eip utilisateur
    mov edx, [esp + 8]          ; esp utilisateur

    mov ax, USER_DS
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax

    push dword USER_DS          ; ss
    push edx                    ; esp
    pushfd
    pop eax
    or eax, 0x200               ; IF = 1
    push eax                    ; eflags
    push dword USER_CS          ; cs
    push ecx                    ; eip
    iret
