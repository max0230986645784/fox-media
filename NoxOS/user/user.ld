/* NoxOS userland - script de liaison des programmes utilisateur
 * Binaire plat charge par le kernel a USER_BASE (0x40000000) ; l'execution
 * commence au tout premier octet (_start dans crt0.asm). Le .bss est inclus
 * dans le binaire (rempli de zeros par objcopy, voir Makefile) pour que la
 * taille du fichier corresponde exactement a la memoire a mapper.
 */
ENTRY(_start)
OUTPUT_FORMAT(elf32-i386)

SECTIONS
{
    . = 0x40000000;

    .text : ALIGN(16) { *(.text.start) *(.text .text.*) }
    .rodata : ALIGN(16) { *(.rodata .rodata.*) }
    .data : ALIGN(16) { *(.data .data.*) }
    .bss : ALIGN(16) { *(COMMON) *(.bss .bss.*) }

    /DISCARD/ : { *(.comment) *(.note.*) *(.eh_frame) }
}
