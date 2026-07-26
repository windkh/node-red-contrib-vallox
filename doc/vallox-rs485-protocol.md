# Vallox RS485 interface description

Second translation of the Vallox DIGIT bus protocol, also valid for Helios KWL. Original by
Petteri Kähärä, 27.06.2011, translated from Finnish via English.

This is the **authority for read/write classification**. It carries per-register and per-bit
`read only` / `write only` markers that the pdftotext extract in [`protocol.txt`](protocol.txt)
lost or garbled. Where the two disagree, this file wins. `protocol.txt` is still worth keeping: it
has **Annex B** (the 12-second broadcast list, the Helios three-recipient write sequence and the
user-terminal traces), which this translation does not.

Parts of the original are untranslated Finnish. They are left as-is rather than paraphrased.

## Corrections applied to `protocol.txt`

Four differences were found against this translation and fixed in `protocol.txt`:

| Where                  | `protocol.txt` had                            | Corrected to                                         |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `57H` heading          | no marker                                     | `r` — the register is read only                      |
| `A3H` bits 6, 7        | no marker                                     | `read only` (bits 4-5 had kept theirs)               |
| `34H` heading and body | "EXHAUST TEMPERATURE", duplicating `33H`      | "EXTRACT AIR TEMPERATURE" (_poistoilma_)             |
| `36H` fault code `08H` | "Exhaust air sensor fault", duplicating `0AH` | "Extract air sensor fault" (_poistoilma-anturivika_) |

Annex A (the NTC table) was verified entry by entry against both translations: all 256 values agree,
and both agree with the implementation. See [`test/protocol-doc.test.js`](../test/protocol-doc.test.js).

---

## DIGIT CHANNEL PROTOCOL

Petteri Kähärä 27.06.2011

VALLOX DIGIT – bus protocol

### 1. General Information

DIGIT's data transfer between the modules is based on shielded twisted pair of bus implemented
temperature, which takes place through a RS 485 for serial. RS-485 design allows the
A maximum of 32 pieces of modules, each of which contains a transmitter and a receiver.

### 2. Communication

DIGIT's communication is based on the bi-directional RS-485 serial communications.
9600 bps, no parity (N), 8 data bits, 1 stop bit.

### 3. Protocol

#### 3.1 The request / response principle (request / response service)

The request / response principle of the structure is shown in Figure 1. Information wishing module
(requester) module to determine what information is desired, by setting the RECIPIENT
the variable content of the object moduliosoitteen. Requested set PROMPT contents of a variable to 0
example, information on request. What information the requester wishes to be notified by setting
VARIABLE variable to the contents of the register address from which information is desired.

All modules (except the requester) listen to the bus and the module, which is responsible for
moduliosoite RECIPIENT variable content to create a response packet with the DATA variable contains
response to a broadcast request. This response packet is sent back to the requester.

| Request     | Response |
| ----------- | -------- |
| SYSTEM      | SYSTEM   |
| FROM        | FROM     |
| RECEIVER    | RECEIVER |
| REQUEST FOR | VARIABLE |
| VARIABLE    | DATA     |
| CHECKSUM    | CHECKSUM |

fig 1. Network Transformer updating request / response basis

Requested by waiting for a response for up to 10 ms. If the answer is not in question. time will
not, send the requester request packet again and again waits for max. 10 ms. If there is no answer
of 10 pcs request / waiting-period, moves asked the module fault condition.

The request / response principle is used when information is transferred from the recipient of the
requester, For example, when the remote control to request a master-master board one of the set
values.

#### 3.2 Transmission / reset principle (end-to-end service an acknowledged)

Transmission / acknowledgment principle structure is shown in Figure 2. The information mediating
module configure the module for the information to be sent by setting RECIPIENT the variable content
of the object moduliosoitteen. What kind of information sent by the sender reported by setting the
variable variable to the contents of the register address, the information transmitted. The
information is placed in the DATA variable.

All modules (except the sender) listen to the bus and the module, which is responsible for module
address RECIPIENT variable content to acknowledge receipt of the packet checksum.

```text
SYSTEEMI TARKISTUSSUMMA
LÄHETTÄJÄ
VASTAANOTTAJA
MUUTTUJA
DATA
TARKISTUSSUMMA
Lähetys Kuittaus
```

Kuva 2. Verkkomuuttujan päivittäminen lähetys/kuittaus –periaatteella

Lähettäjä odottaa kuittausta maksimissaan 10 ms. Jos kuittaus ei ko. ajassa tule, lähetetään
paketti uudelleen ja odotetaan jälleen max. 10 ms. Jos kuittausta ei tule 10 kpl lähetys/odotus-
jakson aikana, siirtyy lähettänyt moduli vikatilaan.

Lähetys/kuittaus -periaatetta käytetään kun siirretään informaatiota lähettäjältä
vastaanottajalle, esimerkiksi kun kauko-ohjain lähettää uuden asetusarvon isäntä-emokortille.

#### 3.3 Kuittaamaton lähetys -periaate (unacknowledged service)

Kuittaamattoman lähetyksen -periaatteen rakenne on esitetty kuvassa 3. Informaatiota
lähettävä moduli määrittää mille moduliryhmälle informaatiota halutaan lähettää asettamalla
VASTAANOTTAJA-muuttujan sisällöksi kohderyhmän osoitteen. Mitä informaatiota lähettäjä
lähettää ilmoitetaan asettamalla MUUTTUJA-muuttujan sisällöksi sen rekisterin osoite, jonka
informaatiota lähetetään. Varsinainen informaatio asetetaan DATA-muuttujaan.

Kaikki modulit (paitsi lähettäjä) kuuntelevat väylää ja ne modulit, joiden ryhmäosoite vastaa
VASTAANOTTAJA-muuttujan sisältöä vastaanottavat paketin kuittaamatta sitä mitenkään.

```text
SYSTEEMI
LÄHETTÄJÄ
VASTAANOTTAJA
MUUTTUJA
DATA
TARKISTUSSUMMA
Lähetys
```

Kuva 3. Verkkomuuttujan päivittäminen kuittaamaton lähetys -periaatteella

Kuittaamaton lähetys -periaatteen ongelmana on, että lähettäjä ei tiedä menikö informaatio
kaikille niille moduleille, joille informaatio oli tarkoitettu. Kuittaamaton lähetys -periaatetta
käytetään kun siirretään informaatiota lähettäjältä usealle vastaanottajalle, esimerkiksi kun
kauko-ohjain lähettää uuden asetusarvon muille kauko-ohjaimille ja orja-emokortille.

**SYSTEEMI:** muuttujan avulla voidaan samaan väylään kytketyt erilliset systeemit eristää
toisistaan. Valittavissa väliltä 1 H -FF H (255 kpl). Nykyisin implementoitu vain 1,
joten pakko asettaa aina 1:ksi.

**LÄHETTÄJÄ:** muuttuja ilmaisee miltä modulilta kyseinen informaatio tulee.

- `11H`-`1FH` = emokortti 1-15.
- `21H`-`2FH` = kauko-ohjain 1-15.
- `31H`-`FFH` = varattu.

**VASTAANOTTAJA:** muuttuja ilmaisee mille modulille kyseinen informaatio tulee.

- `10H` = kaikki emokortit.
- `11H`-`1FH` = emokortti 1-15.
- `20H` = kaikki kauko-ohjaimet.
- `21H`-`2FH` = kauko-ohjain 1-15.
- `30H`-`FFH` = varattu.

**PYYNTÖ:** muuttujan avulla lähettäjä pyytää vastaanottajaa vastaamaan pyyntöön.
asetettava aina 0:ksi.

**MUUTTUJA:** muuttuja ilmaisee mitä informaatiota käsitellään.

**DATA:** MUUTTUJA-muuttujan arvo. Mahdolliset arvot on kuvattu edellä vastaavan
muuttujan yhteydessä.

**TARKISTUSSUMMA:** Edellisten tavujen summa 8-bittisenä. Paketin vastaanottaja laskee itse
tarkistussummaa edeltävät tavut yhteen ja vertaa sitä TARKISTUSSUMMA-muuttujan sisältöön. Jos
tulokset eivät vastaa toisiaan hylkää vastaanottaja saamansa paketin.

---

## DIGIT PROTOCOL DESCRIPTION OF VARIABLES

### 06H I/O port — read only

Read only! DANGER! more than one bit conversion number one to burn the transformer!
Speed is defined in the variable 29H safely.

Fan speed Relays:

```text
bit 0 = speed 1             0 = off     1 = on      read-only
bit 1 = speed 2             0 = off     1 = on      read-only
bit 2 = speed 3             0 = off     1 = on      read-only
bit 3 = speed 4             0 = off     1 = on      read-only
bit 4 = speed 5             0 = off     1 = on      read-only
bit 5 = speed 6             0 = off     1 = on      read-only
bit 6 = speed 7             0 = off     1 = on      read-only
bit 7 = speed 8             0 = off     1 = on      read-only
```

### 07H I/O port

```text
bit 5 = post-heating on     0 = off     1 = on      read-only
```

### 08H I/O port

```text
bit 1 = damper motor position   0 = winter  1 = season  read-only
bit 2 = fault signal relay      0 = open    1 = closed  read-only
bit 3 = supply fan              0 = on      1 = off
bit 4 = preheating              0 = off     1 = on      read-only
bit 5 = exhaust fan             0 = on      1 = off
bit 6 = fireplace / booster     0 = open    1 = closed  read-only
```

### 29H CURRENT FAN SPEED

```text
01H = speed 1
03H = speed 2
07H = speed 3
0FH = speed 4
1FH = speed 5
3FH = speed 6
7FH = speed 7
FFH = speed 8
```

### 2AH MAXIMUM CURRENT MEASURED MOISTURE CONTENT — read only

`33H` = 0% RH, `FFH` = 100% RH. Calculation formula: `(x-51) / 2.04`

### 2BH MAXIMUM CURRENT MEASURED concentration of CO2 upper byte — read only

Concentration of CO2 in the 16-bit upper byte directly inform the content of PPM

### 2CH SUURIN TÄMÄNHETKINEN MITATTU CO2-PITOISUUS lower byte — read only

Concentration of CO2 in the 16-bit lower byte directly inform the content of PPM

### 2DH MACHINE INSTALLED CO2 sensor — read only

```text
bit 1 = Sensor 1    0 = not installed   1 = installed
bit 2 = Sensor 2    0 = not installed   1 = installed
bit 3 = Sensor 3    0 = not installed   1 = installed
bit 4 = Sensor 4    0 = not installed   1 = installed
bit 5 = Sensor 5    0 = not installed   1 = installed
```

### 2EH MILLIAMPEERI/JÄNNITEVIESTI — read only

Tämänhetkinen koneelle tuleva mA-/jänniteviesti asteikolla `00H` - `FFH`

### 2FH MITATTU %RH-PITOISUUS ANTURILTA 1 — read only

`33H` = 0 %RH, `FFH` = 100 %RH. Laskukaava: `(x-51)/2,04`

### 30H MITATTU %RH-PITOISUUS ANTURILTA 2 — read only

`33H` = 0 %RH, `FFH` = 100 %RH. Laskukaava: `(x-51)/2,04`

### 32H ULKOLÄMPÖTILA — read only

Ulkoilman lämpötila NTC-anturin asteikolla.

### 33H JÄTEILMAN LÄMPÖTILA — read only

Jäteilman lämpötila NTC-anturin asteikolla.

### 34H POISTOILMAN LÄMPÖTILA — read only

Poistoilman lämpötila NTC-anturin asteikolla.

### 35H TULOILMAN LÄMPÖTILA — read only

Tuloilman lämpötila NTC-anturin asteikolla.

### 36H VIKATILAN VIRHENUMERO — read only

Viimeisen vian numero

```text
05H = Tuloilma-anturivika
06H = Hiilidioksidihälytys
07H = Ulkoilma-anturivika
08H = Poistoilma-anturivika
09H = Vesipatterin jäätymisvaara
0AH = Jäteilma-anturivika
```

### 55H JÄLKILÄMMITYKSEN ON-LASKURI

Jälkilämmityksen päälläoloaika sekunteina, laskuri. Prosentteina: `X/2,5`

### 56H JÄLKILÄMMITYKSEN OFF-AIKA

Jälkilämmityksen off-aika sekunteina, laskuri. Prosentteina: `X/2,5`

### 57H JÄLKILÄMMITYKSEN KOHDEARVO — read only

Ilmanvaihtovyöhykkeelle puhallettavan ilman tavoiteltu lämpötila NTC-anturin asteikolla.

### 6DH FLAGS 2 — read only

```text
bit 0 = CO2 suurempi nopeus -pyyntö     0 = ei muut.    1 = nop. ylös
bit 1 = CO2 pienempi nopeus -pyyntö     0 = ei muut.    1 = nop. alas
bit 2 = %RH pienempi nopeus –pyyntö     0 = ei muut.    1 = nop. alas
bit 3 = kytkin pien. nop. –pyyntö       0 = ei muut.    1 = nop. alas
bit 6 = CO2 –hälytys                    0 = ei muut.    1 = CO2 –hälytys
bit 7 = kennon jäätymishälytys          0 = ei muut.    1 = jäätymisvaara
```

### 6FH FLAGS 4 — read only

```text
bit 4 = water radiator danger of freezing   0 = no risk     1 = risk
bit 7 = slave/master selection              0 = slave       1 = master
```

### 70H FLAGS 5

```text
bit 7 = preheating status flag      0 = on      1 = off
```

### 71H FLAGS 6

```text
bit 4 = remote monitoring control    0 = ei toim.  1 = toiminn.  read-only
bit 5 = Activation of the fireplace switch — read the variable and set this number one
bit 6 = fireplace/booster status     0 = off       1 = on        read only
```

### 79H TAKKA/TEHOSTUSKYTKIMEN LASKURI — read only

Toiminnon jäljellä oleva aika minuutteina, laskeva

### 8FH LÄHETYS SALLITTU — vain kirjoitus (write only)

Modulien sallitaan lähettää tietoa rs-485 väylään. DATA = aina 0.

### 91H LÄHETYS KIELLETTY — vain kirjoitus (write only)

Moduleja kielletään lähettämästä tietoa rs-485 väylään. DATA = aina 0.

### A3H SELECT VARIABLE: INDICATORS

```text
bit 0 = Power                   0 = ei pala     1 = palaa
bit 1 = CO2 –näppäin            0 = ei pala     1 = palaa
bit 2 = %RH –näppäin            0 = ei pala     1 = palaa
bit 3 = Post-heating button/key 0 = ei pala     1 = palaa
bit 4 = The filter guard indicator      0 = ei pala     1 = palaa   read-only
bit 5 = Post-heating indicator light    0 = ei pala     1 = palaa   read-only
bit 6 = fault indicator                 0 = ei pala     1 = palaa   read-only
bit 7 = service reminder                0 = ei pala     1 = palaa   read-only
```

### A4H JÄLKILÄMMITYKSEN ASETUSARVO

Jälkilämmityksen kohdearvo NTC-anturin asteikolla.

### A5H MAKSIMIPUHALLINNOPEUS

Suurin puhallinnopeus joka voidaan asettaa säätöjen aikana. Sallitut arvot:

```text
01H = Speed 1
03H = Speed 2
07H = Speed 3
0FH = Speed 4
1FH = Speed 5
3FH = Speed 6
7FH = Speed 7
FFH = Speed 8
```

### A6H HUOLTOMUISTUTTIMEN AIKAVÄLI

Huoltomuistuttimen aikaväli kuukausina.

### A7H ETULÄMMITYKSEN KYTKENTÄLÄMPÖTILA

Etulämmityksen kytkentälämpötila NTC-anturin asteikolla.

### A8H TULOILMAPUHALTIMEN PYSÄYTYSLÄMPÖTILA

Tuloilmapuhaltimen pysäytyslämpötila NTC-anturin asteikolla.

### A9H PERUSPUHALLINNOPEUS

Sallitut arvot:

```text
01H = Speed 1
03H = Speed 2
07H = Speed 3
0FH = Speed 4
1FH = Speed 5
3FH = Speed 6
7FH = Speed 7
FFH = Speed 8
```

### AAH PROGRAM-PARAMETER

```text
bit 0-3 The adjustment interval for 4-bit
bit 4 = the moisture level of the Auto Search    0 = off        1 = on
bit 5 = fireplace switch mode                    0 = fireplace  1 = booster
bit 6 = water / electric radiator model          0 = electric   1 = water
bit 7 = cascade                                  0 = off        1 = on
```

### ABH HUOLTOMUISTUTTIMEN KUUKAUSILASKURI

The maintenance counter month to inform the next maintenance alarm time remaining months.
Descending.

### AEH PERUSKOSTEUSTASO

`33H` = 0 %RH, `FFH` = 100 %RH. Laskukaava: `(x-51)/2,04`

### AFH KENNONOHITUKSEN TOIMINTALÄMPÖTILA

Kennonohituksen toimintalämpötila NTC-anturin asteikolla.

### B0H TASAVIRTATULOILMAPUHALTIMEN SÄÄDÖN ASETUSARVO

Tasavirtatuloilmapuhaltimen säädön asetusarvo prosentteina.

### B1H TASAVIRTAPOISTOILMAPUHALTIMEN SÄÄDÖN ASETUSARVO

Tasavirtapoistoilmapuhaltimen säädön asetusarvo prosentteina.

### B2H KENNON JÄÄTYMISENESTON LÄMPÖTILOJEN HYSTEREESI

Kennon jäätymiseneston lämpötilojen hystereesi, `03H` ≅ 1 °C.

### B3H HIILIDIOKSIDISÄÄDÖN ASETUSARVO 16 BIT

Hiilidioksidisäädön asetusarvo 16 –bittisenä, ylätavu ilmoittaa suoraan pitoisuuden PPM

### B4H HIILIDIOKSIDISÄÄDÖN ASETUSARVO 16 BIT

Hiilidioksidisäädön asetusarvo 16 –bittisenä, alatavu ilmoittaa suoraan pitoisuuden PPM

### B5H PROGRAM2 Variables

```text
bit 0 = Maximum speed limitation    0 = with adjustments    1 = always on
```

The use of any of the above variables is strictly prohibited!

---

## CONVERSION: NTC SENSOR SCALE - °C

```text
HEX 	DEC 	°C 	HEX 	DEC 	°C 	HEX 	DEC 	°C 	HEX 	DEC 	°C
00	0	-74	40	64	-12	80	128	9	C0	192	34
01	1	-70	41	65	-12	81	129	9	C1	193	34
02	2	-66	42	66	-12	82	130	9	C2	194	35
03	3	-62	43	67	-11	83	131	10	C3	195	35
04	4	-59	44	68	-11	84	132	10	C4	196	36
05	5	-56	45	69	-11	85	133	10	C5	197	36
06	6	-54	46	70	-10	86	134	11	C6	198	37
07	7	-52	47	71	-10	87	135	11	C7	199	37
08	8	-50	48	72	-9	88	136	11	C8	200	38
09	9	-48	49	73	-9	89	137	12	C9	201	38
0A	10	-47	4A	74	-9	8A	138	12	CA	202	39
0B	11	-46	4B	75	-8	8B	139	12	CB	203	40
0C	12	-44	4C	76	-8	8C	140	13	CC	204	40
0D	13	-43	4D	77	-8	8D	141	13	CD	205	41
0E	14	-42	4E	78	-7	8E	142	13	CE	206	41
0F	15	-41	4F	79	-7	8F	143	14	CF	207	42
10	16	-40	50	80	-7	90	144	14	D0	208	43
11	17	-39	51	81	-6	91	145	14	D1	209	43
12	18	-38	52	82	-6	92	146	15	D2	210	44
13	19	-37	53	83	-6	93	147	15	D3	211	45
14	20	-36	54	84	-5	94	148	15	D4	212	45
15	21	-35	55	85	-5	95	149	16	D5	213	46
16	22	-34	56	86	-5	96	150	16	D6	214	47
17	23	-33	57	87	-4	97	151	16	D7	215	48
18	24	-33	58	88	-4	98	152	17	D8	216	48
19	25	-32	59	89	-4	99	153	17	D9	217	49
1A	26	-31	5A	90	-3	9A	154	18	DA	218	50
1B	27	-30	5B	91	-3	9B	155	18	DB	219	51
1C	28	-30	5C	92	-3	9C	156	18	DC	220	52
1D	29	-29	5D	93	-2	9D	157	19	DD	221	53
1E	30	-28	5E	94	-2	9E	158	19	DE	222	53
1F	31	-28	5F	95	-2	9F	159	19	DF	223	54
20	32	-27	60	96	-1	A0	160	20	E0	224	55
21	33	-27	61	97	-1	A1	161	20	E1	225	56
22	34	-26	62	98	-1	A2	162	21	E2	226	57
23	35	-25	63	99	-1	A3	163	21	E3	227	59
24	36	-25	64	100	0	A4	164	21	E4	228	60
25	37	-24	65	101	0	A5	165	22	E5	229	61
26	38	-24	66	102	0	A6	166	22	E6	230	62
27	39	-23	67	103	1	A7	167	22	E7	231	63
28	40	-23	68	104	1	A8	168	23	E8	232	65
29	41	-22	69	105	1	A9	169	23	E9	233	66
2A	42	-22	6A	106	2	AA	170	24	EA	234	68
2B	43	-21	6B	107	2	AB	171	24	EB	235	69
2C	44	-21	6C	108	2	AC	172	24	EC	236	71
2D	45	-20	6D	109	3	AD	173	25	ED	237	73
2E	46	-20	6E	110	3	AE	174	25	EE	238	75
2F	47	-19	6F	111	3	AF	175	26	EF	239	77
30	48	-19	70	112	4	B0	176	26	F0	240	79
31	49	-19	71	113	4	B1	177	27	F1	241	81
32	50	-18	72	114	4	B2	178	27	F2	242	82
33	51	-18	73	115	5	B3	179	27	F3	243	86
34	52	-17	74	116	5	B4	180	28	F4	244	90
35	53	-17	75	117	5	B5	181	28	F5	245	93
36	54	-16	76	118	5	B6	182	29	F6	246	97
37	55	-16	77	119	6	B7	183	29	F7	247	100
38	56	-16	78	120	6	B8	184	30	F8	248	100
39	57	-15	79	121	6	B9	185	30	F9	249	100
3A	58	-15	7A	122	7	BA	186	31	FA	250	100
3B	59	-14	7B	123	7	BB	187	31	FB	251	100
3C	60	-14	7C	124	7	BC	188	32	FC	252	100
3D	61	-14	7D	125	8	BD	189	32	FD	253	100
3E	62	-13	7E	126	8	BE	190	33	FE	254	100
3F	63	-13	7F	127	8	BF	191	33	FF	255	100
```
