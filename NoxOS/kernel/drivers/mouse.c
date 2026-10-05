/* NoxOS - souris PS/2 (port auxiliaire du controleur 8042, IRQ12)
 *
 * Initialisation : activation du port aux (0xA8), activation de l'IRQ12 dans
 * l'octet de configuration du controleur, puis commandes a la souris :
 * 0xF6 (parametres par defaut) et 0xF4 (envoi des paquets). Chaque mouvement
 * arrive ensuite en paquets de 3 octets : [boutons/signes] [dx] [dy].
 *
 * L'IRQ ne fait que decoder le paquet et mettre a jour la position ; le
 * bureau lit l'etat avec mouse_state() ou consomme les evenements de clic
 * avec mouse_poll_event().
 */
#include <nox/mouse.h>
#include <nox/io.h>
#include <nox/idt.h>
#include <nox/pic.h>

#define PS2_DATA    0x60
#define PS2_STATUS  0x64
#define PS2_CMD     0x64
#define IRQ_MOUSE   12

static int  pos_x, pos_y, max_x, max_y;
static u32  buttons;
static u8   packet[3];
static int  packet_idx;
static bool present;

#define EV_SIZE 32
static struct mouse_event events[EV_SIZE];
static u32 ev_head, ev_tail;

static void wait_input(void)      /* attendre que le tampon d'entree soit libre */
{
    for (u32 i = 0; i < 100000; i++)
        if (!(inb(PS2_STATUS) & 0x02))
            return;
}

static void wait_output(void)     /* attendre un octet a lire */
{
    for (u32 i = 0; i < 100000; i++)
        if (inb(PS2_STATUS) & 0x01)
            return;
}

static void mouse_write(u8 value)
{
    wait_input();
    outb(PS2_CMD, 0xD4);          /* prochain octet -> souris */
    wait_input();
    outb(PS2_DATA, value);
}

static u8 mouse_read(void)
{
    wait_output();
    return inb(PS2_DATA);
}

static void push_event(enum mouse_event_type type, u32 button)
{
    u32 next = (ev_head + 1) % EV_SIZE;
    if (next == ev_tail)
        return;
    events[ev_head] = (struct mouse_event){ type, pos_x, pos_y, button, buttons };
    ev_head = next;
}

static void mouse_irq(struct registers *regs)
{
    (void)regs;
    u8 status = inb(PS2_STATUS);
    if (!(status & 0x20))         /* bit 5 : l'octet vient du clavier, pas de nous */
        return;
    u8 b = inb(PS2_DATA);

    if (packet_idx == 0 && !(b & 0x08))
        return;                   /* bit 3 toujours a 1 sur le 1er octet : resynchro */
    packet[packet_idx++] = b;
    if (packet_idx < 3)
        return;
    packet_idx = 0;

    u8 flags = packet[0];
    if (flags & 0xC0)             /* debordement X/Y : paquet ignore */
        return;
    int dx = (int)packet[1] - ((flags & 0x10) ? 256 : 0);
    int dy = (int)packet[2] - ((flags & 0x20) ? 256 : 0);

    pos_x += dx;
    pos_y -= dy;                  /* la souris compte Y vers le haut */
    if (pos_x < 0) pos_x = 0;
    if (pos_y < 0) pos_y = 0;
    if (pos_x > max_x) pos_x = max_x;
    if (pos_y > max_y) pos_y = max_y;

    u32 now = flags & 0x07;
    u32 changed = now ^ buttons;
    buttons = now;
    if (dx || dy)
        push_event(MOUSE_MOVE, 0);
    for (u32 bit = 0; bit < 3; bit++)
        if (changed & (1u << bit))
            push_event((now & (1u << bit)) ? MOUSE_DOWN : MOUSE_UP, 1u << bit);
}

bool mouse_init(int screen_w, int screen_h)
{
    max_x = screen_w - 1;
    max_y = screen_h - 1;
    pos_x = screen_w / 2;
    pos_y = screen_h / 2;

    wait_input();
    outb(PS2_CMD, 0xA8);          /* activer le port auxiliaire */
    wait_input();
    outb(PS2_CMD, 0x20);          /* lire l'octet de configuration */
    u8 cfg = mouse_read();
    cfg |= 0x02;                  /* IRQ12 */
    cfg &= (u8)~0x20;             /* horloge souris active */
    wait_input();
    outb(PS2_CMD, 0x60);
    wait_input();
    outb(PS2_DATA, cfg);

    mouse_write(0xF6);            /* parametres par defaut */
    if (mouse_read() != 0xFA)
        return false;
    mouse_write(0xF4);            /* activer l'envoi des paquets */
    if (mouse_read() != 0xFA)
        return false;

    irq_register_handler(IRQ_MOUSE, mouse_irq);
    pic_unmask(2);                /* cascade PIC esclave */
    pic_unmask(IRQ_MOUSE);
    present = true;
    return true;
}

bool mouse_present(void) { return present; }

void mouse_state(int *x, int *y, u32 *btn)
{
    if (x)   *x = pos_x;
    if (y)   *y = pos_y;
    if (btn) *btn = buttons;
}

bool mouse_poll_event(struct mouse_event *ev)
{
    if (ev_head == ev_tail)
        return false;
    *ev = events[ev_tail];
    ev_tail = (ev_tail + 1) % EV_SIZE;
    return true;
}
