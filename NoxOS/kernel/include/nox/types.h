/* NoxOS - types de base (kernel freestanding, pas de libc) */
#ifndef NOX_TYPES_H
#define NOX_TYPES_H

typedef unsigned char      u8;
typedef unsigned short     u16;
typedef unsigned int       u32;
typedef unsigned long long u64;
typedef signed char        i8;
typedef signed short       i16;
typedef signed int         i32;
typedef signed long long   i64;

typedef u32 size_t;
typedef u32 uintptr_t;

typedef enum { false = 0, true = 1 } bool;

#define NULL ((void *)0)

#define KERNEL_VERSION "0.3.0"
#define KERNEL_NAME    "NOXOS KERNEL"

#define NOX_BOOT_MAGIC 0x4E4F5831u /* "NOX1" */

#endif
