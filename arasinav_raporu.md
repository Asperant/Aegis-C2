# T.C. KONYA TEKNİK ÜNİVERSİTESİ
# MÜHENDİSLİK VE DOĞA BİLİMLERİ FAKÜLTESİ
# BİLGİSAYAR MÜHENDİSLİĞİ
# 3. SINIF BAHAR DÖNEMİ
# BİLİŞİM TEKNOLOJİLERİ UYGULAMASI ARASINAV RAPORU

---

| | |
|---|---|
| **Öğrencinin Adı- Soyadı** | *(Adınızı buraya yazın)* |
| **Numarası:** | *(Numaranızı buraya yazın)* |
| **Danışmanı Adı Soyadı:** | *(Danışman adını buraya yazın)* |
| **Sınav Tarihi:** | *(Tarihi buraya yazın)* |

**Projenin Adı:** Dağıtık Sistemler Tabanlı İHA-YKİ (UAV-GCS) Haberleşme Simülasyonu

---

## DÖNEM İÇİ YAPILAN ÇALIŞMALARIN ÖZETİ

Dönemin ilk yarısında, Dağıtık Sistemler Tabanlı İHA-YKİ Haberleşme Simülasyonu projesinin kavramsal temelleri atılmış ve sistem mimarisi tasarlanmıştır. Proje kapsamında İnsansız Hava Aracı (İHA) ile Yer Kontrol İstasyonu (YKİ/GKS) arasındaki güvenli haberleşmenin, dağıtık bir altyapı üzerinde gerçekleştirilmesi hedeflenmektedir.

Bu süreçte öncelikle kapsamlı bir literatür taraması gerçekleştirilmiştir. UAV-GCS haberleşme protokolleri, dağıtık mesaj kuyruklama sistemleri, konteynerizasyon teknolojileri ve sıfır güven (Zero Trust) güvenlik mimarileri konularında akademik yayınlar ve endüstriyel standartlar incelenmiştir. MAVLink protokolü [1], Redis Pub/Sub mesajlaşma modeli [2] ve Kubernetes orkestrasyon mimarisi [3] üzerine detaylı araştırmalar yapılmıştır.

Mimari tasarım aşamasında, sistemin üç temel bileşen üzerine kurulmasına karar verilmiştir: C++ ile geliştirilecek İHA istemci modülü (UAV_Client), Python ile geliştirilecek Yer Kontrol Sunucusu (GKS_Server) ve C# (.NET) ile geliştirilecek merkezi Komuta Kontrol API'si (Aegis_API). Bu üç farklı programlama dilinin kullanılması, gerçek dünya savunma sistemlerindeki heterojen yazılım ortamını simüle etme amacı taşımaktadır.

Docker Compose altyapısı kurulmuş ve temel konteyner yapılandırmaları (Dockerfile'lar) oluşturulmuştur [6]. PostgreSQL veritabanı şeması tasarlanmış, İHA kayıt tablosu (uav_registry), uçuş oturumları tablosu (flight_sessions) ve zaman tabanlı partitioned telemetri log tablosu (telemetry_logs) tanımlanmıştır [10]. Redis veritabanı, servisler arası gerçek zamanlı mesajlaşma altyapısı olarak konfigüre edilmiştir [2].

Güvenlik altyapısı olarak ECDSA (Elliptic Curve Digital Signature Algorithm) ve ECDH (Elliptic Curve Diffie-Hellman) tabanlı asimetrik anahtar çifti üretim betiği (generate_keys.py) hazırlanmıştır [4]. Ancak bu anahtarların el sıkışma (handshake) protokolüne tam entegrasyonu henüz gerçekleştirilmemiştir.

Kubernetes (Minikube) ortamına geçiş için Helm chart şablonları oluşturulmaya başlanmış, `values.yaml` ve temel deployment şablonları hazırlanmıştır [9]. Bununla birlikte, henüz tam kapsamlı bir Kubernetes ortamında sistem ayağa kaldırılmamıştır.

UAV_Client modülünün temel UDP soket iletişim altyapısı (`UdpTransceiver.cpp`) kodlanmaya başlanmış, ancak şifreleme entegrasyonu ve telemetri sensör simülasyonu henüz tamamlanmamıştır. GKS_Server tarafında ise `server.py` dosyasının iskelet yapısı oluşturulmuş, paket alım döngüsü ve temel veri yapıları tanımlanmıştır. Haberleşme modüllerinin bir kısmı kodlama ve entegrasyon aşamasındadır.

Dönemin kalan sürecinde, şifreleme katmanının tam entegrasyonu, Redis üzerinden telemetri yayınlama mekanizmasının kodlanması, SignalR gerçek zamanlı veri aktarım hub'ının devreye alınması ve kapsamlı entegrasyon testlerinin gerçekleştirilmesi planlanmaktadır.

---

## PROJENİN AMACI ve ÖNEMİ

### Projenin Amacı:

Bu projenin temel amacı, İnsansız Hava Araçları (İHA) ile Yer Kontrol İstasyonları (YKİ) arasındaki haberleşme sürecini, dağıtık sistemler mimarisi üzerinde modelleyen kapsamlı bir simülasyon ortamı geliştirmektir. Proje, C++ (İHA istemcisi), Python (Yer Kontrol Sunucusu) ve C# (Merkezi Komuta Kontrol API'si) olmak üzere üç farklı programlama dili kullanarak, heterojen yazılım bileşenlerinin Redis mesaj aracısı üzerinden tutarlı ve güvenli bir şekilde haberleşmesini sağlamayı hedeflemektedir.

Simülasyon ortamı, gerçek dünya İHA operasyonlarındaki kritik haberleşme gereksinimlerini karşılayacak biçimde tasarlanmıştır. Bu gereksinimler arasında uçtan uca şifrelenmiş veri iletimi (AES-256-GCM) [5], sıfır güven (Zero Trust) kimlik doğrulama mekanizması [4, 8], Forward Error Correction (FEC) ile paket kurtarma, otomatik istasyon devir (handover) mekanizması ve Kubernetes orkestrasyon altyapısı üzerinde dinamik ölçeklenebilirlik yer almaktadır [3].

### Projenin Önemi:

İnsansız hava araçları, günümüzde hem askeri hem de sivil alanda giderek artan bir öneme sahiptir. İHA'ların güvenli ve kesintisiz haberleşmesi, operasyonel başarı için kritik bir faktör olarak öne çıkmaktadır. Bu proje, söz konusu haberleşme altyapısının dağıtık sistemler perspektifinden ele alınması açısından önem taşımaktadır.

Projenin akademik önemi, birden fazla programlama dilinde yazılmış bileşenlerin, endüstri standardı araçlar (Docker, Kubernetes, Redis, PostgreSQL, Nginx) kullanılarak orkestrasyonunu pratiğe dökme fırsatı sunmasıdır. Bu sayede, gerçek dünya yazılım mühendisliğinde karşılaşılan çok dilli servis entegrasyonu, güvenli protokol tasarımı ve konteynerize dağıtım gibi konularda uygulamalı deneyim kazanılmaktadır.

Ayrıca proje, kriptografik güvenlik mekanizmalarının (ECDSA dijital imza, ECDH anahtar değişimi, AES-256-GCM şifreleme) gerçek bir iletişim protokolüne entegrasyonunu içermesi bakımından, siber güvenlik alanında da uygulamalı bir çalışma niteliği taşımaktadır.

---

## KAYNAK ARAŞTIRMASI

Proje kapsamında gerçekleştirilen literatür taramasında aşağıdaki konularda akademik ve teknik kaynaklar incelenmiştir:

**1. İHA-YKİ Haberleşme Protokolleri:** MAVLink (Micro Air Vehicle Link) protokolü, İHA haberleşmesinde en yaygın kullanılan açık kaynaklı protokol olarak incelenmiştir [1]. MAVLink'in paket yapısı, sıralama numarası (sequence number) mekanizması ve telemetri veri formatı, projedeki özel UDP protokolünün tasarımında referans alınmıştır. Bununla birlikte, MAVLink'in şifreleme desteğinin sınırlı olması nedeniyle projeye özgü bir güvenlik katmanı tasarlanmıştır.

**2. Dağıtık Mesajlaşma Sistemleri:** Redis Pub/Sub mesajlaşma modeli, düşük gecikmeli ve yüksek performanslı gerçek zamanlı veri dağıtımı için tercih edilmiştir [2]. Karşılaştırmalı olarak Apache Kafka ve RabbitMQ sistemleri de değerlendirilmiş, ancak projenin simülasyon odaklı yapısı ve düşük gecikme gereksinimi nedeniyle Redis'in daha uygun olduğuna karar verilmiştir.

**3. Konteynerizasyon ve Orkestrasyon:** Docker konteyner teknolojisi [6] ve Kubernetes orkestrasyon platformu [3], mikro servis mimarisinin dağıtımı ve yönetimi için seçilmiştir. Helm paket yöneticisi, Kubernetes kaynaklarının deklaratif yapılandırması amacıyla kullanılmaktadır [9]. Minikube, yerel geliştirme ortamında Kubernetes cluster simülasyonu için tercih edilen araçtır.

**4. Kriptografik Güvenlik Standartları:** NIST SP 800-56A (Pair-Wise Key Establishment Schemes Using Discrete Logarithm Cryptography) [4] ve NIST SP 800-38D (Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode) [5] standartları, projede kullanılan ECDH anahtar değişimi ve AES-GCM şifreleme algoritmalarının teorik temelini oluşturmaktadır. Forward Secrecy (İleri Gizlilik) kavramı ve periyodik anahtar rotasyonu mekanizması bu standartlara dayalı olarak tasarlanmıştır.

**5. Gerçek Zamanlı Web Teknolojileri:** ASP.NET Core SignalR kütüphanesi, sunucudan istemciye anlık veri aktarımı (server-push) mekanizması olarak değerlendirilmiştir [7]. WebSocket protokolü üzerinden çalışan SignalR, operatör arayüzüne gerçek zamanlı telemetri verisi ve operasyonel olay bildirimi iletmek amacıyla projeye dahil edilmiştir.

**6. Hata Düzeltme Kodları:** Forward Error Correction (FEC) tekniklerinden XOR tabanlı basit parite kodlaması, UDP iletişiminde kaybolan paketlerin kurtarılması amacıyla incelenmiş ve projenin haberleşme katmanına entegre edilmek üzere planlanmıştır.

---

## MATERYAL VE METOT

### Kullanılan Teknolojiler ve Araçlar:

**Programlama Dilleri:**
- **C++ (ISO C++17):** İHA istemci modülünün geliştirilmesinde kullanılmaktadır. Düşük seviyeli UDP soket programlama, binary veri serileştirme ve OpenSSL kriptografi kütüphanesi entegrasyonu amacıyla tercih edilmiştir.
- **Python 3:** Yer Kontrol Sunucusu (GKS) modülünün geliştirilmesinde kullanılmaktadır. Asyncio tabanlı asenkron I/O modeli ve Redis/PostgreSQL asenkron istemci kütüphaneleri ile yüksek eşzamanlılık hedeflenmiştir.
- **C# (.NET 8):** Merkezi Komuta Kontrol API'sinin (Aegis API) geliştirilmesinde kullanılmaktadır. ASP.NET Core Web API framework'ü, SignalR gerçek zamanlı iletişim hub'ı ve Kubernetes C# istemci kütüphanesi bu modülde kullanılmaktadır.

**Altyapı ve Orkestrasyon:**
- **Docker & Docker Compose:** Her bir servis bileşeninin konteynerize edilmesi ve yerel geliştirme ortamında kolay ayağa kaldırılması amacıyla kullanılmaktadır.
- **Kubernetes (Minikube):** Üretim benzeri dağıtık ortam simülasyonu, pod bazlı ölçeklendirme ve dinamik İHA/GKS oluşturma/silme işlemleri için kullanılmaktadır.
- **Helm:** Kubernetes kaynaklarının versiyonlanabilir ve parametrik yapılandırması için tercih edilmiştir.

**Veritabanları ve Mesajlaşma:**
- **Redis:** Servisler arası gerçek zamanlı mesajlaşma (Pub/Sub), İHA oturum durumu yönetimi ve GKS kayıt defteri olarak kullanılmaktadır.
- **PostgreSQL 15:** Kalıcı veri depolama, telemetri log kaydı ve uçuş oturumu yönetimi amacıyla kullanılmaktadır.

**Ağ ve Güvenlik:**
- **Nginx:** API Gateway (ters proxy) olarak yapılandırılmış; rate limiting, güvenlik başlıkları ve WebSocket tünelleme işlevlerini üstlenmektedir.
- **OpenSSL / Python Cryptography:** ECDSA, ECDH ve AES-256-GCM kriptografik işlemleri için kullanılmaktadır.

### Yöntem:

Proje, mikro servis mimarisi yaklaşımıyla tasarlanmıştır. Her bir bileşen bağımsız bir Docker konteynerinde çalışmakta ve Redis mesaj aracısı üzerinden iletişim kurmaktadır. İHA istemcisi, UDP protokolü üzerinden GKS sunucusuna şifrelenmiş telemetri paketleri göndermektedir. GKS sunucusu, bu paketleri çözerek Redis'e yayınlamakta, Aegis API ise Redis'ten abonelik yoluyla (subscribe) telemetri verilerini alarak SignalR hub üzerinden kullanıcı arayüzüne aktarmaktadır.

Bu aşamada sistem mimarisi ve veri akışı tasarlanmış, ancak tüm bileşenlerin entegre testleri henüz gerçekleştirilmemiştir.

---

## KAYNAKLAR

1. MAVLink Protocol Documentation. (2024). MAVLink Developer Guide. https://mavlink.io/en/

2. Redis Documentation. (2024). Pub/Sub Messaging Pattern. https://redis.io/docs/interact/pubsub/

3. Kubernetes Documentation. (2024). Concepts - Pods, Deployments. https://kubernetes.io/docs/concepts/

4. NIST SP 800-56A Rev. 3. (2018). Recommendation for Pair-Wise Key-Establishment Schemes Using Discrete Logarithm Cryptography. National Institute of Standards and Technology.

5. NIST SP 800-38D. (2007). Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC. National Institute of Standards and Technology.

6. Docker Documentation. (2024). Docker Compose Overview. https://docs.docker.com/compose/

7. Microsoft ASP.NET Core Documentation. (2024). Introduction to SignalR. https://learn.microsoft.com/en-us/aspnet/core/signalr/

8. OpenSSL Documentation. (2024). EVP API - Authenticated Encryption. https://www.openssl.org/docs/manmaster/man7/evp.html

9. Helm Documentation. (2024). Getting Started. https://helm.sh/docs/

10. PostgreSQL Documentation. (2024). Table Partitioning. https://www.postgresql.org/docs/current/ddl-partitioning.html

---
---
---

# T.C. KONYA TEKNİK ÜNİVERSİTESİ
# MÜHENDİSLİK VE DOĞA BİLİMLERİ FAKÜLTESİ
# BİLGİSAYAR MÜHENDİSLİĞİ
# 3. SINIF BAHAR DÖNEMİ
# BİLİŞİM TEKNOLOJİLERİ UYGULAMASI FİNAL(BÜT) RAPORU

---

| | |
|---|---|
| **Öğrencinin Adı- Soyadı** | *(Adınızı buraya yazın)* |
| **Numarası:** | *(Numaranızı buraya yazın)* |
| **Danışmanı Adı Soyadı:** | *(Danışman adını buraya yazın)* |
| **Sınav Tarihi:** | *(Tarihi buraya yazın)* |

**Projenin Adı:** Dağıtık Sistemler Tabanlı İHA-YKİ (UAV-GCS) Haberleşme Simülasyonu

---

## DÖNEM İÇİ YAPILAN ÇALIŞMALARIN ÖZETİ

Dönem süresince, Dağıtık Sistemler Tabanlı İHA-YKİ Haberleşme Simülasyonu projesinin tüm bileşenleri tamamlanmış ve başarıyla entegre edilmiştir.

**Birinci Aşama (Dönem Başı – Arasınav Dönemi):** Projenin kavramsal temelleri atılmış, kapsamlı bir literatür taraması gerçekleştirilmiş ve sistem mimarisi tasarlanmıştır. Docker Compose altyapısı kurulmuş, PostgreSQL veritabanı şeması (İHA kayıt, uçuş oturumu ve zaman bazlı partitioned telemetri tabloları) tasarlanmıştır. ECDSA/ECDH tabanlı asimetrik anahtar çifti üretim altyapısı hazırlanmış ve Kubernetes Helm chart şablonları oluşturulmaya başlanmıştır. UAV_Client UDP soket iletişim altyapısı ve GKS_Server iskelet yapısı kodlanmıştır.

**İkinci Aşama (Arasınav Sonrası – Final Dönemi):** Projenin tüm kritik bileşenleri kodlanmış, entegre edilmiş ve test edilmiştir. Bu aşamada gerçekleştirilen çalışmalar şu şekilde özetlenebilir:

**C++ İHA İstemcisi (UAV_Client):** `UdpTransceiver.cpp` modülü tamamlanarak, AES-256-GCM şifreleme/şifre çözme [6], ECDH tabanlı Zero-Trust el sıkışma (handshake) protokolü [5], Forward Error Correction (XOR tabanlı FEC parite paketi üretimi ve gönderimi), dinamik anahtar rotasyonu (Perfect Forward Secrecy) ile Make-Before-Break geçiş mekanizması ve birden fazla taktik komutun (RTL, STOP, Orbit, Figure-8 gibi) şifrelenmiş alım ve çözüm mantığı tam olarak kodlanmıştır. `TelemetrySensor.cpp` modülü ile İHA'nın fizik tabanlı hareket simülasyonu (ivmelenme, yavaşlama, heading hesaplaması), waypoint odaklı otonom navigasyon, Rabbit Chasing algoritmasıyla gelişmiş manevra takibi (Orbit, Figure-8, Evasive Maneuver) ve gerçekçi batarya tüketimi ile öncelik (priority) etiketleme mekanizması eksiksiz olarak tamamlanmıştır. `CryptoEngine.cpp` modülü, OpenSSL EVP API kullanarak [9] ECDSA/ECDH anahtar yükleme, geçici (ephemeral) anahtar üretimi ve RAII tabanlı akıllı işaretçi (smart pointer) sarmalayıcıları ile hafıza güvenli kriptografik işlemler sağlamaktadır.

**Python GKS Sunucusu (GKS_Server):** `server.py` (1088 satır) modülü ile UDP datagram tabanlı asenkron paket alım ve işleme hattı, Token Bucket algoritmasıyla IP tabanlı DDoS koruması (rate limiting), Haversine formülüyle mesafe hesabına dayalı menzil kontrolü ve otomatik istasyon devir (handover) mekanizması, Redis Pub/Sub üzerinden [2] komut dinleme ve İHA'ya şifreli komut yönlendirme ve FEC paket kurtarma (XOR decode) ile kayıp paket telafisi eksiksiz olarak gerçekleştirilmiştir. `repository.py` modülü, asyncio tabanlı Redis ve asyncpg (PostgreSQL) [11] bağlantı havuzları yönetimi, İHA oturum yaşam döngüsü yönetimi (oluşturma, durum takibi, kapatma), telemetri verisi ve operasyonel olay yayınlama (Redis Streams + Pub/Sub) [2, 3] ve GKS kayıt defteri (periyodik heartbeat ile otomatik keşif) işlevlerini üstlenmektedir. `crypto_manager.py` modülü, sunucu tarafındaki ECDH paylaşılan sır (shared secret) hesaplama [5], AES-256-GCM şifreleme/şifre çözme [6] ve pending session mekanizmasıyla kesintisiz anahtar rotasyonu desteği sağlamaktadır.

**C# Aegis API (.NET 8):** `Program.cs` ile JWT tabanlı kimlik doğrulama, Serilog yapısal loglama, CORS politikası, MediatR CQRS deseni [13] ve FluentValidation entegrasyonu [14] konfigüre edilmiştir. `DeploymentController.cs` ile İHA ve GKS dinamik oluşturma (spawn) ve silme (delete) endpoint'leri, menzil tabanlı geofence kontrolü, GKS menzil yarıçapı güncelleme ve ICMP ping işlevleri REST API üzerinden sunulmaktadır. `TacticalController.cs` ile takti̇k komut ve görev (mission) yükleme endpoint'leri MediatR handler'ları aracılığıyla Redis'e yayınlanmaktadır. `KubernetesOrchestratorService.cs` (894 satır) ile Kubernetes API istemcisi üzerinden dinamik pod oluşturma/silme [4], Docker Compose fallback modu [7], Helm deployment scale-down [10] ve en yakın GKS host seçim algoritması gerçekleştirilmiştir. `RedisSubscriberService.cs` ile Redis kanallarından gelen telemetri ve olay verilerinin SignalR hub [8] üzerinden tüm bağlı C2 ekranlarına gerçek zamanlı iletimi ve GKS konum bilgisinin periyodik yayını sağlanmaktadır. `TelemetryHub.cs` ile SignalR üzerinden operatör oturum yönetimi ve taktik komut iletimi gerçekleştirilmektedir.

**React Kullanıcı Arayüzü (aegis-ui):** Vite + React tabanlı taktik harita arayüzü, İHA ve GKS konumlarının gerçek zamanlı olarak harita üzerinde gösterimi, uçuş yolu takibi, komut paneli, operasyonel olay terminali ve GKS kontrol paneli ile tam fonksiyonel bir komuta kontrol ekranı geliştirilmiştir.

**Altyapı ve Dağıtım:** Docker Compose ile 7 servislik tam yığın (full stack) yerel dağıtım, Kubernetes (Minikube) ortamına Helm ile üretim benzeri dağıtım, Nginx API Gateway ile rate limiting, güvenlik başlıkları ve WebSocket tünelleme ve kriptografik sertifika yönetimi (Kubernetes Secret olarak) eksiksiz olarak yapılandırılmıştır.

Sonuç olarak, tüm modüller Redis üzerinden sorunsuz haberleşmekte, şifreleme/şifre çözme işlemleri hatasız çalışmakta, FEC kurtarma mekanizması kayıp paketleri başarıyla telafi etmekte ve otomatik handover mekanizması İHA menzil geçişlerini kesintisiz yönetmektedir. Hedeflenen çalışan sistem başarıyla ortaya konmuştur.

---

## PROJENİN AMACI ve ÖNEMİ

### Projenin Amacı:

Bu projenin temel amacı, İnsansız Hava Araçları (İHA) ile Yer Kontrol İstasyonları (YKİ) arasındaki haberleşme sürecini, dağıtık sistemler mimarisi üzerinde modelleyen kapsamlı bir simülasyon ortamı geliştirmektir [12]. Proje, C++ (İHA istemcisi), Python (Yer Kontrol Sunucusu) ve C# (Merkezi Komuta Kontrol API'si) olmak üzere üç farklı programlama dili kullanarak, heterojen yazılım bileşenlerinin Redis mesaj aracısı üzerinden tutarlı ve güvenli bir şekilde haberleşmesini sağlamayı hedeflemektedir.

Simülasyon ortamı, gerçek dünya İHA operasyonlarındaki kritik haberleşme gereksinimlerini karşılayacak biçimde tasarlanmıştır. Uçtan uca şifrelenmiş veri iletimi (AES-256-GCM) [6], sıfır güven (Zero Trust) kimlik doğrulama mekanizması (ECDSA + ECDH) [5], Forward Error Correction (FEC) ile paket kurtarma, otomatik istasyon devir (handover) mekanizması, Kubernetes orkestrasyon altyapısı üzerinde dinamik ölçeklenebilirlik [4] ve tam fonksiyonel bir gerçek zamanlı komuta kontrol arayüzü bu kapsamda gerçekleştirilmiştir.

### Projenin Önemi:

İnsansız hava araçları, günümüzde hem askeri hem de sivil alanda giderek artan bir öneme sahiptir. İHA'ların güvenli ve kesintisiz haberleşmesi, operasyonel başarı için kritik bir faktör olarak öne çıkmaktadır. Bu proje, söz konusu haberleşme altyapısının dağıtık sistemler perspektifinden ele alınması açısından önem taşımaktadır.

Projenin akademik önemi, birden fazla programlama dilinde yazılmış bileşenlerin, endüstri standardı araçlar (Docker, Kubernetes, Redis, PostgreSQL, Nginx) kullanılarak orkestrasyonunu pratiğe dökme fırsatı sunmasıdır. Bu sayede, gerçek dünya yazılım mühendisliğinde karşılaşılan çok dilli servis entegrasyonu, güvenli protokol tasarımı ve konteynerize dağıtım gibi konularda uygulamalı deneyim kazanılmıştır.

Proje, kriptografik güvenlik mekanizmalarının (ECDSA dijital imza, ECDH anahtar değişimi, AES-256-GCM authenticated encryption, Perfect Forward Secrecy) gerçek bir iletişim protokolüne entegrasyonunu içermesi bakımından, siber güvenlik alanında da uygulamalı bir çalışma niteliği taşımaktadır [15]. Ayrıca, Kubernetes üzerinde dinamik pod yönetimi ile bulut-yerel (cloud-native) uygulama geliştirme pratikleri deneyimlenmiştir [4].

---

## KAYNAK ARAŞTIRMASI

Proje kapsamında gerçekleştirilen literatür taramasında aşağıdaki konularda akademik ve teknik kaynaklar incelenmiştir:

**1. İHA-YKİ Haberleşme Protokolleri:** MAVLink (Micro Air Vehicle Link) protokolü, İHA haberleşmesinde en yaygın kullanılan açık kaynaklı protokol olarak incelenmiştir [1]. MAVLink'in paket yapısı, sıralama numarası (sequence number) mekanizması ve telemetri veri formatı, projedeki özel UDP protokolünün tasarımında referans alınmıştır. Projeye özgü protokolde, MAVLink'in sunmadığı uçtan uca AES-256-GCM şifreleme katmanı eklenmiştir. Ayrıca, paket başlığında kullanılan magic byte mekanizması (0xFF telemetri, 0xDD handshake, 0xFE FEC gibi) MAVLink'in STX başlığından esinlenilmiştir.

**2. Dağıtık Mesajlaşma Sistemleri:** Redis Pub/Sub mesajlaşma modeli, düşük gecikmeli ve yüksek performanslı gerçek zamanlı veri dağıtımı için tercih edilmiştir [2]. Redis Streams API'si, operasyonel olay geçmişinin sıralı ve kalıcı biçimde saklanması amacıyla kullanılmıştır [3]. Karşılaştırmalı olarak Apache Kafka ve RabbitMQ sistemleri de değerlendirilmiş, Redis'in hem Pub/Sub hem de anahtar-değer deposu olarak tek bir altyapıda birleştirilmesi projenin mimari karmaşıklığını azaltmıştır.

**3. Konteynerizasyon ve Orkestrasyon:** Docker konteyner teknolojisi [7] ve Kubernetes orkestrasyon platformu [4], mikro servis mimarisinin dağıtımı ve yönetimi için kullanılmıştır. Helm paket yöneticisi, Kubernetes kaynaklarının deklaratif yapılandırması amacıyla kullanılmıştır [10]. Minikube, yerel geliştirme ortamında Kubernetes cluster simülasyonu için tercih edilen araçtır. Proje, aynı anda hem Docker Compose hem de Kubernetes ortamında çalışabilecek şekilde çift modlu orkestrasyon desteği sunmaktadır.

**4. Kriptografik Güvenlik Standartları:** NIST SP 800-56A (Pair-Wise Key Establishment Schemes Using Discrete Logarithm Cryptography) standardı, projede kullanılan ECDH anahtar değişimi mekanizmasının teorik temelini oluşturmuştur [5]. NIST SP 800-38D (GCM and GMAC) standardı, AES-256-GCM authenticated encryption implementasyonuna rehberlik etmiştir [6]. Periyodik anahtar rotasyonu (her N pakette bir), Perfect Forward Secrecy prensibi doğrultusunda tasarlanmış ve Make-Before-Break geçiş stratejisiyle kesintisiz haberleşme sağlanmıştır.

**5. Gerçek Zamanlı Web Teknolojileri:** ASP.NET Core SignalR kütüphanesi, sunucudan istemciye anlık veri aktarımı mekanizması olarak kullanılmıştır [8]. Redis Pub/Sub kanallarından alınan telemetri verileri ve operasyonel olaylar, SignalR hub üzerinden WebSocket bağlantısıyla tüm bağlı C2 ekranlarına eşzamanlı olarak yayınlanmaktadır. JWT tabanlı token doğrulama, WebSocket bağlantılarının yetkilendirilmesi amacıyla kullanılmıştır.

**6. Hata Düzeltme Kodları (FEC):** XOR tabanlı erasure coding tekniği, UDP iletişiminde kaybolan paketlerin kurtarılması amacıyla uygulanmıştır. Her 3 kritik telemetri paketi için bir XOR parite paketi üretilmekte, sunucu tarafında 2+1 pencere mantığıyla kayıp paket çözümlenmektedir. Bu yaklaşım, RAID-5 parity hesaplamasına benzer bir mantık izlemektedir.

**7. Ağ Güvenliği ve Rate Limiting:** Token Bucket algoritması, IP tabanlı DDoS saldırı koruması amacıyla GKS sunucusunda uygulanmıştır. Nginx katmanında ise rate limiting zone'ları (API için 30r/s, Auth için 5r/s) tanımlanmıştır. X-Frame-Options, X-Content-Type-Options, Content-Security-Policy gibi güvenlik başlıkları ayarlanmıştır.

---

## MATERYAL VE METOT

### Kullanılan Teknolojiler ve Araçlar:

**Programlama Dilleri:**
- **C++ (ISO C++17):** İHA istemci modülünün (UAV_Client) geliştirilmesinde kullanılmıştır. POSIX UDP soket programlama, OpenSSL EVP API ile AES-256-GCM şifreleme/şifre çözme [9], ECDSA dijital imza ve ECDH anahtar değişimi, HKDF anahtar türetme ve RAII tabanlı akıllı işaretçi (unique_ptr) sarmalayıcıları ile hafıza güvenliği sağlanmıştır. CMake derleme sistemi kullanılmıştır.
- **Python 3 (asyncio):** Yer Kontrol Sunucusu (GKS_Server) modülünün geliştirilmesinde kullanılmıştır. `asyncio.DatagramProtocol` ile asenkron UDP paket işleme, `redis.asyncio` kütüphanesi ile asenkron Redis iletişimi, `asyncpg` kütüphanesi ile asenkron PostgreSQL bağlantı havuzu yönetimi ve `cryptography` kütüphanesi ile AESGCM, ECDSA ve HKDF kriptografi işlemleri gerçekleştirilmiştir.
- **C# (.NET 8 / ASP.NET Core):** Merkezi Komuta Kontrol API'sinin (Aegis_API) geliştirilmesinde kullanılmıştır. ASP.NET Core Web API, SignalR gerçek zamanlı iletişim hub'ı, MediatR CQRS deseni, FluentValidation validasyon kütüphanesi, Serilog yapısal loglama, StackExchange.Redis istemcisi ve KubernetesClient C# SDK'sı kullanılmıştır.
- **JavaScript (React 18 + Vite):** Taktik komuta kontrol arayüzünün geliştirilmesinde kullanılmıştır. Leaflet harita kütüphanesi, @microsoft/signalr istemcisi ve Tailwind CSS ile gerçek zamanlı taktik harita görselleştirmesi sağlanmıştır.

**Altyapı ve Orkestrasyon:**
- **Docker & Docker Compose:** 7 servis (GKS, API, UI, UAV, Gateway, Redis, PostgreSQL) konteyner olarak yapılandırılmıştır. Docker socket montajı ile Aegis API, çalışma zamanında yeni İHA/GKS konteyner'ları oluşturabilmektedir.
- **Kubernetes (Minikube) & Helm:** Üretim benzeri orkestrasyon, Deployment/Pod yönetimi, Secret tabanlı sertifika dağıtımı ve NodePort servisler ile tam bir Kubernetes dağıtımı sağlanmıştır.
- **Nginx:** API Gateway olarak yapılandırılmış; ters proxy, rate limiting (Token Bucket), güvenlik başlıkları ve WebSocket tünelleme işlevlerini üstlenmektedir.

**Veritabanları ve Mesajlaşma:**
- **Redis 7 (Alpine):** `telemetry_stream` kanalı (İHA telemetri yayını), `command_stream` kanalı (taktik komut yayını), `ops_event_stream` kanalı (operasyonel olay yayını) ve `ops_event_history` Stream (olay geçmişi) olmak üzere çoklu Pub/Sub kanalları ve Hash yapıları (`uav:{id}`, `gks_instance:{id}`) kullanılmıştır.
- **PostgreSQL 15 (Alpine):** Zaman tabanlı partitioned telemetri tablosu (aylık partitionlar), uçuş oturumu yaşam döngüsü ve komut denetim logu olarak yapılandırılmıştır [11].

### Sistem Mimarisi ve Veri Akışı:

Sistem, mikro servis mimarisi yaklaşımıyla tasarlanmıştır. Veri akışı şu şekilde gerçekleşmektedir:

1. **İHA → GKS (UDP, AES-256-GCM Şifreli):** İHA istemcisi, telemetri verilerini (enlem, boylam, irtifa, hız, batarya, uçuş modu, öncelik) binary struct formatında serileştirerek AES-256-GCM ile şifreler ve UDP datagram olarak GKS'ye gönderir. GKS, paketin magic byte'ını kontrol eder, oturum anahtarıyla şifresini çözer, replay saldırılarını timestamp doğrulamasıyla engeller ve menzil kontrolü gerçekleştirir.

2. **GKS → Redis (Pub/Sub):** GKS, çözülen telemetri verisini JSON formatında `telemetry_stream` kanalına, operasyonel olayları `ops_event_stream` kanalına yayınlar. İHA durum bilgisi Redis Hash yapısında (`uav:{id}`) tutulur.

3. **Redis → Aegis API (BackgroundService):** `RedisSubscriberService` arka plan servisi, Redis kanallarını dinleyerek gelen verileri yakalar.

4. **Aegis API → Kullanıcı Arayüzü (SignalR WebSocket):** Telemetri ve olay verileri, `TelemetryHub` üzerinden WebSocket bağlantısıyla tüm bağlı operatör ekranlarına gerçek zamanlı olarak iletilir.

5. **Kullanıcı Arayüzü → Aegis API → Redis → GKS → İHA (Komut Zinciri):** Operatör komutları ters yönde, aynı güvenlik katmanlarından geçerek İHA'ya ulaştırılır. Komutlar AES-256-GCM ile şifrelenerek UDP üzerinden İHA'ya gönderilir.

### Güvenlik Mimarisi:

- **Sıfır Güven (Zero Trust) El Sıkışması:** Her İHA-GKS bağlantısı, ECDSA imza doğrulaması ve ECDH anahtar değişimi ile başlatılır. İmza doğrulaması başarısız olan bağlantı talepleri siber saldırı olarak loglanır ve reddedilir.
- **Perfect Forward Secrecy:** Her N pakette bir otomatik anahtar rotasyonu (rekey) gerçekleştirilir. Make-Before-Break stratejisi ile eski ve yeni anahtar eşzamanlı olarak desteklenir, haberleşme kesintisi yaşanmaz.
- **FEC Paket Kurtarma:** Kritik telemetri paketleri için XOR tabanlı parite hesaplaması yapılır, kayıp paketler çözümlenerek kurtarılır.
- **Otomatik Handover:** İHA menzil dışına çıktığında, Haversine formülüyle en yakın aktif GKS tespit edilir ve handover komutu İHA'ya gönderilir. İHA yeni GKS ile sıfır güven el sıkışmasını tamamlayarak kesintisiz geçiş yapar.

### Test ve Doğrulama:

Sistem, aşağıdaki senaryolarda başarıyla test edilmiştir:
- Çoklu İHA'nın eşzamanlı telemetri gönderimi ve gerçek zamanlı harita üzerinde izlenmesi
- Şifreleme/şifre çözme tutarlılığı ve anahtar rotasyonu sırasında veri kaybı olmaması
- FEC kurtarma mekanizmasının kayıp paketleri doğru şekilde çözmesi
- Otomatik handover ile menzil geçişlerinin kesintisiz gerçekleşmesi
- Docker Compose ve Kubernetes (Minikube) ortamlarında tam sistemin ayağa kaldırılması
- Nginx rate limiting ve güvenlik başlıklarının doğru çalışması
- Operatör komutlarının (RTL, STOP, Orbit, Mission Upload) İHA'ya ulaşması ve uygulanması

---

## KAYNAKLAR

1. MAVLink Protocol Documentation. (2024). MAVLink Developer Guide. https://mavlink.io/en/

2. Redis Documentation. (2024). Pub/Sub Messaging Pattern. https://redis.io/docs/interact/pubsub/

3. Redis Documentation. (2024). Redis Streams Introduction. https://redis.io/docs/data-types/streams/

4. Kubernetes Documentation. (2024). Concepts - Pods, Deployments, Services. https://kubernetes.io/docs/concepts/

5. NIST SP 800-56A Rev. 3. (2018). Recommendation for Pair-Wise Key-Establishment Schemes Using Discrete Logarithm Cryptography. National Institute of Standards and Technology.

6. NIST SP 800-38D. (2007). Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC. National Institute of Standards and Technology.

7. Docker Documentation. (2024). Docker Compose Overview. https://docs.docker.com/compose/

8. Microsoft ASP.NET Core Documentation. (2024). Introduction to SignalR. https://learn.microsoft.com/en-us/aspnet/core/signalr/

9. OpenSSL Documentation. (2024). EVP API - Authenticated Encryption. https://www.openssl.org/docs/manmaster/man7/evp.html

10. Helm Documentation. (2024). Getting Started. https://helm.sh/docs/

11. PostgreSQL Documentation. (2024). Table Partitioning. https://www.postgresql.org/docs/current/ddl-partitioning.html

12. Tanenbaum, A. S., & Van Steen, M. (2017). Distributed Systems: Principles and Paradigms (3rd Edition). Pearson.

13. MediatR Documentation. (2024). Simple Mediator Implementation in .NET. https://github.com/jbogard/MediatR

14. FluentValidation Documentation. (2024). Validation Library for .NET. https://docs.fluentvalidation.net/

15. Stallings, W. (2022). Cryptography and Network Security: Principles and Practice (8th Edition). Pearson.
