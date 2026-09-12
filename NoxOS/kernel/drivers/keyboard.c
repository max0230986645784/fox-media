/* NoxOS - pilote clavier PS/2 (IRQ 1, port 0x60)
 *
 * A chaque touche, le controleur 8042 leve l'IRQ 1 et fournit un "scancode"
 * (jeu 1) sur le port 0x60. Le bit 7 indique un relachement. On traduit
 * les scancodes en ASCII (disposition QWERTY US pour l'instant) et on les
 * place dans un tampon circulaire lu par le shell.
 */
#include <nox/keyboard.h>
#include <nox/idt.h>
#include <nox/pic.h>
#include <nox/io.h>

#define KBD_DATA   0x60
#define KBD_STATUS 0x64
#define BUF_SIZE   128

static char buffer[BUF_SIZE];
static volatile u32 head;
static volatile u32 tail;

static bool shift_down;
static bool ctrl_down;
static bool caps_lock;

static const char keymap_lower[128] = {
    0,   27,  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '\b', '\t',
    'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\n', 0,   'a', 's',
    'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', '`', 0,  '\\', 'z', 'x', 'c', 'v',
    'b', 'n', 'm', ',', '.', '/', 0,   '*', 0,   ' ', 0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   '7', '8', '9', '-', '4', '5', '6', '+', '1',
    '2', '3', '0', '.', 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
};

static const char keymap_upper[128] = {
    0,   27,  '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '\b', '\t',
    'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}', '\n', 0,   'A', 'S',
    'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', '~', 0,   '|', 'Z', 'X', 'C', 'V',
    'B', 'N', 'M', '<', '>', '?', 0,   '*', 0,   ' ', 0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   '7', '8', '9', '-', '4', '5', '6', '+', '1',
    '2', '3', '0', '.', 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
};

#define SC_LSHIFT 0x2A
#define SC_RSHIFT 0x36
#define SC_CTRL   0x1D
#define SC_CAPS   0x3A

static void buffer_push(char c)
{
    u32 next = (head + 1) % BUF_SIZE;
    if (next == tail)
        return;             /* tampon plein : on perd la touche */
    buffer[head] = c;
    head = next;
}

static void keyboard_irq(struct registers *regs)
{
    (void)regs;
    u8 sc = inb(KBD_DATA);

    if (sc == 0xE0)
        return;             /* prefixe des touches etendues : ignore en v0.1 */

    bool released = (sc & 0x80) != 0;
    sc &= 0x7F;

    switch (sc) {
    case SC_LSHIFT:
    case SC_RSHIFT:
        shift_down = !released;
        return;
    case SC_CTRL:
        ctrl_down = !released;
        return;
    case SC_CAPS:
        if (!released)
            caps_lock = !caps_lock;
        return;
    default:
        break;
    }

    if (released)
        return;

    char c = shift_down ? keymap_upper[sc] : keymap_lower[sc];
    if (!c)
        return;

    if (caps_lock && c >= 'a' && c <= 'z')
        c = (char)(c - 'a' + 'A');
    else if (caps_lock && c >= 'A' && c <= 'Z' && !shift_down)
        c = (char)(c - 'A' + 'a');

    if (ctrl_down && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')))
        c = (char)((c & 0x1F));   /* Ctrl+C -> 0x03, etc. */

    buffer_push(c);
}

void keyboard_init(void)
{
    head = tail = 0;
    irq_register_handler(IRQ_KEYBOARD, keyboard_irq);

    /* Vide le tampon du controleur au cas ou une touche traine. */
    while (inb(KBD_STATUS) & 0x01)
        inb(KBD_DATA);

    pic_unmask(IRQ_KEYBOARD);
}

bool keyboard_poll(char *c)
{
    if (head == tail)
        return false;
    *c = buffer[tail];
    tail = (tail + 1) % BUF_SIZE;
    return true;
}

char keyboard_getc(void)
{
    char c;
    while (!keyboard_poll(&c))
        hlt();              /* dort jusqu'a la prochaine interruption */
    return c;
}
