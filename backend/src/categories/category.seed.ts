/**
 * Cây danh mục khởi tạo cho sàn (2 cấp, bám theo thói quen mua sắm ở VN).
 * Chỉ seed khi collection còn rỗng — sau này admin tự quản lý.
 */
export interface SeedCategory {
  name: string;
  icon?: string;
  children: string[];
}

export const CATEGORY_SEED: SeedCategory[] = [
  {
    name: 'Thời trang & Phụ kiện',
    icon: 'TShirt',
    children: [
      'Thời trang nam',
      'Thời trang nữ',
      'Giày dép',
      'Túi ví',
      'Đồng hồ',
      'Trang sức & Phụ kiện',
    ],
  },
  {
    name: 'Điện tử & Công nghệ',
    icon: 'DeviceMobile',
    children: [
      'Điện thoại & Máy tính bảng',
      'Laptop & Máy tính',
      'Phụ kiện công nghệ',
      'Âm thanh',
      'Máy ảnh & Quay phim',
      'Thiết bị thông minh',
    ],
  },
  {
    name: 'Nhà cửa & Đời sống',
    icon: 'House',
    children: [
      'Đồ dùng nhà bếp',
      'Nội thất',
      'Chăn ga gối đệm',
      'Đồ dùng phòng tắm',
      'Trang trí nhà cửa',
      'Dụng cụ & Sửa chữa',
    ],
  },
  {
    name: 'Sức khỏe & Làm đẹp',
    icon: 'Sparkle',
    children: [
      'Chăm sóc da',
      'Trang điểm',
      'Chăm sóc tóc',
      'Nước hoa',
      'Thực phẩm chức năng',
      'Thiết bị y tế',
    ],
  },
  {
    name: 'Thực phẩm & Đồ uống',
    icon: 'ForkKnife',
    children: [
      'Đồ ăn vặt',
      'Đồ uống',
      'Thực phẩm khô',
      'Thực phẩm tươi sống',
      'Gia vị',
      'Đặc sản vùng miền',
    ],
  },
  {
    name: 'Mẹ & Bé',
    icon: 'Baby',
    children: [
      'Đồ dùng cho bé',
      'Sữa & Thực phẩm cho bé',
      'Thời trang trẻ em',
      'Đồ chơi',
      'Đồ dùng cho mẹ',
    ],
  },
  {
    name: 'Sách & Văn phòng phẩm',
    icon: 'BookOpen',
    children: [
      'Sách văn học',
      'Sách thiếu nhi',
      'Sách kỹ năng & Kinh tế',
      'Giáo trình & Tham khảo',
      'Văn phòng phẩm',
      'Dụng cụ học tập',
    ],
  },
  {
    name: 'Thể thao & Dã ngoại',
    icon: 'PersonSimpleRun',
    children: [
      'Trang phục thể thao',
      'Dụng cụ tập luyện',
      'Xe đạp & Phụ kiện',
      'Đồ dã ngoại',
      'Thể thao dưới nước',
    ],
  },
  {
    name: 'Ô tô & Xe máy',
    icon: 'Car',
    children: [
      'Phụ kiện ô tô',
      'Phụ kiện xe máy',
      'Dầu nhớt & Chăm sóc xe',
      'Mũ bảo hiểm',
    ],
  },
  {
    name: 'Thú cưng',
    icon: 'PawPrint',
    children: [
      'Thức ăn cho thú cưng',
      'Phụ kiện thú cưng',
      'Chăm sóc & Vệ sinh',
    ],
  },
];
