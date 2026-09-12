/* NoxOS kernel - script de liaison
 * Le kernel est un binaire plat charge par le bootloader a 0x10000.
 * entry.asm (section .text.entry) doit etre en tout premier : c'est la
 * que le bootloader saute.
 */
ENTRY(_start)
OUTPUT_FORMAT(elf32-i386)

SECTIONS
{
    . = 0x10000;
    _kernel_start = .;

    .text : ALIGN(16)
    {
        *(.text.entry)
        *(.text .text.*)
    }

    .rodata : ALIGN(16)
    {
        *(.rodata .rodata.*)
    }

    .data : ALIGN(16)
    {
        *(.data .data.*)
    }

    .bss : ALIGN(16)
    {
        _bss_start = .;
        *(COMMON)
        *(.bss .bss.*)
        _bss_end = .;
    }

    _kernel_end = .;

    /DISCARD/ :
    {
        *(.comment)
        *(.note.*)
        *(.eh_frame)
    }
}
