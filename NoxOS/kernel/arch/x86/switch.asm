; =============================================================================
;  NoxOS - changement de contexte
; -----------------------------------------------------------------------------
;  void switch_context(struct thread *prev, struct thread *next)
;
;  Convention cdecl : eax/ecx/edx sont deja consideres detruits par l'appelant,
;  il suffit donc de sauver ebp/ebx/esi/edi sur la pile de `prev`, de
;  memoriser son esp, puis de charger l'esp de `next` et de tout restaurer.
;  Le `ret` final saute a l'adresse de retour trouvee sur la NOUVELLE pile :
;  soit la suite de switch_context pour un thread deja lance, soit
;  thread_trampoline pour un thread tout neuf (voir thread.c).
;  Le champ esp est le premier de struct thread (offset 0).
; =============================================================================
[BITS 32]
section .text

global switch_context
switch_context:
    mov eax, [esp + 4]          ; prev
    mov edx, [esp + 8]          ; next

    push ebp
    push ebx
    push esi
    push edi
    mov [eax], esp              ; prev->esp = esp

    mov esp, [edx]              ; esp = next->esp
    pop edi
    pop esi
    pop ebx
    pop ebp
    ret
